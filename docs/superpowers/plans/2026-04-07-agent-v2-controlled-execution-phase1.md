# Agent V2 Controlled Execution Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first vertical slice of Agent V2 so OpsClaw can load native rules, classify risky change intents, block invented protected parameters, and pause on a new `parameter_confirmation` gate before executing `session.run_command`.

**Architecture:** Add a machine-readable OpsClaw rule layer plus a planner that sits in front of `session.run_command`. The planner will classify command intent, extract protected mutation parameters, evaluate whether those parameters are user-explicit, user-confirmed, or only agent-inferred, then either allow execution, require approval, or open a `parameter_confirmation` gate. Reuse the existing HITL gate and run-continuation architecture instead of inventing a second orchestration path.

**Tech Stack:** TypeScript, Node.js, Express SSE, React 19, node:test, tsx, YAML

---

## Scope Split

The full controlled-execution spec is too large for one safe plan. This Phase 1 plan is intentionally limited to a single working vertical slice:

- native rule files
- global + group-level rule resolution
- intent classification for `session.run_command`
- protected parameter extraction and provenance checks
- new `parameter_confirmation` gate kind
- AI panel form-based confirmation flow

This phase does **not** yet redesign every tool around the planner or add full audit views. It creates the production substrate that later phases can extend.

## File Map

### New Files

- `opsclaw.rules.yaml`
  - Global default machine-readable policy with built-in intent families, protected parameters, and group override examples.
- `opsclaw.policy.md`
  - Human-readable explanation of the default policy and why certain actions pause.
- `server/agent/controlledExecutionTypes.ts`
  - Shared types for intent kinds, protected parameters, provenance, planner outcomes, and parameter confirmation payloads.
- `server/agent/opsclawRules.ts`
  - Rule file loading, normalization, and effective rule resolution for global plus group-level scopes.
- `server/agent/opsclawRules.test.ts`
  - Rule-loading and group-override coverage.
- `server/agent/sessionCommandPlanner.ts`
  - Intent classification, parameter extraction, provenance checks, and final planner decision for `session.run_command`.
- `server/agent/sessionCommandPlanner.test.ts`
  - Planner regression coverage for low-risk auto execution, dangerous approval, and invented-parameter blocking.
- `src/features/workbench/agentParameterGateModel.ts`
  - Pure frontend helpers for rendering parameter confirmation gates, editable fields, and submission payloads.
- `src/features/workbench/agentParameterGateModel.test.ts`
  - Coverage for parameter form state and validation.

### Existing Files To Modify

- `server/agent/humanGateTypes.ts`
  - Add the `parameter_confirmation` gate kind and payload shape.
- `server/agent/toolTypes.ts`
  - Add planner context data and continuation payload support for parameter confirmation.
- `server/agent/toolPolicy.ts`
  - Keep command fallback logic, but route `session.run_command` through the new planner path before final policy outcome.
- `server/agent/toolExecutor.ts`
  - Call the planner before `session.run_command`, open `parameter_confirmation` pauses, and resume with user-confirmed values.
- `server/agent/agentRuntime.ts`
  - Resolve `parameter_confirmation` gates with submitted values and continue the paused run.
- `server/agent/agentRuntime.test.ts`
  - Cover planner-triggered pauses and resumed execution with user-supplied parameters.
- `server/agent/agentPrompt.ts`
  - Add explicit system guidance that protected mutation parameters must not be invented.
- `server/http/agentRoutes.ts`
  - Accept parameter confirmation payloads on gate resolution.
- `server/http/agentRoutes.test.ts`
  - Cover parameter-confirmation gate resolution over HTTP/SSE.
- `src/features/workbench/types.agent.ts`
  - Add frontend types for parameter confirmation payloads and gate events.
- `src/features/workbench/agentApi.ts`
  - Send structured parameter confirmation payloads when resolving a gate.
- `src/features/workbench/useAgentRun.ts`
  - Support resolving a gate with parameter form values.
- `src/features/workbench/useAgentRunModel.ts`
  - Preserve parameter confirmation gates in timeline state.
- `src/features/workbench/AiAssistantPanel.tsx`
  - Render a compact form for `parameter_confirmation` instead of simple approve/reject buttons.
- `src/features/workbench/agentGateUiModel.ts`
  - Add labels and descriptions for the new gate kind.
- `src/features/workbench/agentGateUiModel.test.ts`
  - Cover user-facing copy for parameter confirmation.

## Task 1: Define Controlled Execution Types And Rule Files

**Files:**
- Create: `opsclaw.rules.yaml`
- Create: `opsclaw.policy.md`
- Create: `server/agent/controlledExecutionTypes.ts`
- Create: `server/agent/opsclawRules.ts`
- Create: `server/agent/opsclawRules.test.ts`

- [ ] **Step 1: Write the failing rule loader test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadOpsClawRules,
  resolveEffectiveOpsClawRules,
} from './opsclawRules.js';

void test('loadOpsClawRules reads global rules and group overrides from opsclaw.rules.yaml', async () => {
  const rules = await loadOpsClawRules(new URL('../../opsclaw.rules.yaml', import.meta.url));

  assert.equal(rules.version, 1);
  assert.equal(rules.global.intents.user_management.defaultRisk, 'high');
  assert.equal(rules.groups.production?.intents.package_management.requireApproval, true);
});

void test('resolveEffectiveOpsClawRules overlays group policy on top of global defaults', async () => {
  const rules = await loadOpsClawRules(new URL('../../opsclaw.rules.yaml', import.meta.url));
  const effective = resolveEffectiveOpsClawRules(rules, 'production');

  assert.equal(effective.intents.package_management.requireApproval, true);
  assert.equal(effective.intents.user_management.protectedParameters.includes('username'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test server/agent/opsclawRules.test.ts`
Expected: FAIL because `opsclawRules.ts` and the YAML file do not exist yet.

- [ ] **Step 3: Add the shared controlled-execution types**

```ts
export type OpsClawIntentKind =
  | 'diagnostic.readonly'
  | 'routine.safe_change'
  | 'service.lifecycle_change'
  | 'filesystem.write'
  | 'filesystem.delete'
  | 'package_management'
  | 'user_management'
  | 'permission_change'
  | 'credential_change';

export type ProtectedParameterName =
  | 'username'
  | 'password'
  | 'sudo_policy'
  | 'target_path'
  | 'target_service'
  | 'write_content'
  | 'delete_scope'
  | 'package_name';

export type ParameterSource =
  | 'user_explicit'
  | 'user_confirmed'
  | 'system_observed'
  | 'agent_inferred';

export type PlannerDecisionKind =
  | 'allow_auto_execute'
  | 'require_parameter_confirmation'
  | 'require_approval'
  | 'deny';
```

- [ ] **Step 4: Create the initial `opsclaw.rules.yaml`**

```yaml
version: 1
global:
  intents:
    diagnostic.readonly:
      defaultRisk: low
      requireApproval: false
      protectedParameters: []
    package_management:
      defaultRisk: medium
      requireApproval: false
      protectedParameters:
        - package_name
    user_management:
      defaultRisk: high
      requireApproval: true
      protectedParameters:
        - username
        - password
        - sudo_policy
    permission_change:
      defaultRisk: high
      requireApproval: true
      protectedParameters:
        - target_path
        - sudo_policy
groups:
  production:
    intents:
      package_management:
        requireApproval: true
```

- [ ] **Step 5: Add the human-readable `opsclaw.policy.md`**

```md
# OpsClaw Default Policy

## Principles

- Low-risk diagnosis and routine operations may execute automatically.
- Dangerous operations require explicit approval.
- Protected mutation parameters must come from the user or from explicit user confirmation.

## Protected Parameters

- usernames
- passwords
- sudo privilege policy
- write targets
- delete scope
- service targets when the action is mutating
```

- [ ] **Step 6: Implement rule loading and effective rule resolution**

```ts
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';

export async function loadOpsClawRules(rulesUrl: URL) {
  const raw = await readFile(rulesUrl, 'utf8');
  const parsed = YAML.parse(raw) as OpsClawRulesFile;
  return parsed;
}

export function resolveEffectiveOpsClawRules(
  rules: OpsClawRulesFile,
  groupName: string | null
) {
  const groupOverride = groupName ? rules.groups[groupName] ?? null : null;

  return {
    intents: {
      ...rules.global.intents,
      ...Object.fromEntries(
        Object.entries(groupOverride?.intents ?? {}).map(([key, override]) => [
          key,
          {
            ...rules.global.intents[key as OpsClawIntentKind],
            ...override,
          },
        ])
      ),
    },
  };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm exec tsx --test server/agent/opsclawRules.test.ts`
Expected: PASS with `2` passing tests.

- [ ] **Step 8: Commit**

```bash
git add opsclaw.rules.yaml opsclaw.policy.md server/agent/controlledExecutionTypes.ts server/agent/opsclawRules.ts server/agent/opsclawRules.test.ts
git commit -m "feat: add opsclaw controlled execution rules foundation"
```

## Task 2: Build The Session Command Planner

**Files:**
- Create: `server/agent/sessionCommandPlanner.ts`
- Create: `server/agent/sessionCommandPlanner.test.ts`
- Modify: `server/agent/commandPolicy.ts`

- [ ] **Step 1: Write the failing planner tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSessionCommandPlan } from './sessionCommandPlanner.js';
import { resolveEffectiveOpsClawRules } from './opsclawRules.js';

const effectiveRules = resolveEffectiveOpsClawRules(
  {
    version: 1,
    global: {
      intents: {
        'diagnostic.readonly': { defaultRisk: 'low', requireApproval: false, protectedParameters: [] },
        user_management: { defaultRisk: 'high', requireApproval: true, protectedParameters: ['username', 'password', 'sudo_policy'] },
      },
    },
    groups: {},
  },
  null
);

void test('allows readonly diagnostics when no protected parameters are needed', () => {
  const plan = buildSessionCommandPlan({
    command: 'df -h',
    effectiveRules,
    sessionGroupName: null,
    userTask: '检查磁盘使用情况',
  });

  assert.equal(plan.intent.kind, 'diagnostic.readonly');
  assert.equal(plan.decision.kind, 'allow_auto_execute');
});

void test('requires parameter confirmation when user management command invents username and password', () => {
  const plan = buildSessionCommandPlan({
    command: 'sudo useradd -m adminuser && echo "adminuser:secret123" | sudo chpasswd',
    effectiveRules,
    sessionGroupName: null,
    userTask: '创建一个 root 权限用户',
  });

  assert.equal(plan.intent.kind, 'user_management');
  assert.equal(plan.decision.kind, 'require_parameter_confirmation');
  assert.deepEqual(
    plan.parameters.map((parameter) => [parameter.name, parameter.source]),
    [
      ['username', 'agent_inferred'],
      ['password', 'agent_inferred'],
    ]
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test server/agent/sessionCommandPlanner.test.ts`
Expected: FAIL because the planner module does not exist yet.

- [ ] **Step 3: Implement minimal intent classification and protected parameter extraction**

```ts
function classifySessionCommandIntent(command: string): OpsClawIntentKind {
  if (/\b(useradd|adduser|usermod|chpasswd|passwd)\b/i.test(command)) {
    return 'user_management';
  }
  if (/\b(systemctl|service)\s+(start|restart|stop)\b/i.test(command)) {
    return 'service.lifecycle_change';
  }
  if (/\b(rm|unlink)\b/i.test(command)) {
    return 'filesystem.delete';
  }
  return 'diagnostic.readonly';
}

function extractProtectedParameters(command: string): ExtractedProtectedParameter[] {
  const parameters: ExtractedProtectedParameter[] = [];
  const userAddMatch = command.match(/\b(?:useradd|adduser)\b(?:\s+-[^\s]+\s+)*([a-z_][a-z0-9_-]*)/i);
  if (userAddMatch) {
    parameters.push({ name: 'username', value: userAddMatch[1] });
  }
  const passwordMatch = command.match(/["']([^:"']+):([^"']+)["']\s*\|\s*sudo\s+chpasswd/i);
  if (passwordMatch) {
    parameters.push({ name: 'password', value: passwordMatch[2] });
  }
  if (/\bNOPASSWD\b/i.test(command)) {
    parameters.push({ name: 'sudo_policy', value: 'NOPASSWD' });
  }
  return parameters;
}
```

- [ ] **Step 4: Add provenance checks against the user task**

```ts
function detectParameterSource(userTask: string, parameterValue: string): ParameterSource {
  return userTask.includes(parameterValue) ? 'user_explicit' : 'agent_inferred';
}

export function buildSessionCommandPlan(input: {
  command: string;
  effectiveRules: EffectiveOpsClawRules;
  sessionGroupName: string | null;
  userTask: string;
}): SessionCommandPlan {
  const intentKind = classifySessionCommandIntent(input.command);
  const extracted = extractProtectedParameters(input.command);
  const parameters = extracted.map((parameter) => ({
    ...parameter,
    confirmed: false,
    source: detectParameterSource(input.userTask, parameter.value),
  }));

  const hasProtectedInference = parameters.some((parameter) => parameter.source === 'agent_inferred');
  if (hasProtectedInference) {
    return {
      intent: { kind: intentKind },
      parameters,
      decision: { kind: 'require_parameter_confirmation' },
    };
  }

  return {
    intent: { kind: intentKind },
    parameters,
    decision: intentKind === 'user_management'
      ? { kind: 'require_approval' }
      : { kind: 'allow_auto_execute' },
  };
}
```

- [ ] **Step 5: Keep command-text fallback logic intact**

```ts
const fallbackDecision = evaluateSessionCommandPolicy({
  approvalMode,
  command,
});

if (fallbackDecision.kind === 'deny' || fallbackDecision.kind === 'require_approval') {
  return fallbackDecision;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec tsx --test server/agent/sessionCommandPlanner.test.ts server/agent/commandPolicy.test.ts`
Expected: PASS with both planner tests and existing command policy tests green.

- [ ] **Step 7: Commit**

```bash
git add server/agent/sessionCommandPlanner.ts server/agent/sessionCommandPlanner.test.ts server/agent/commandPolicy.ts
git commit -m "feat: add intent-aware session command planner"
```

## Task 3: Add `parameter_confirmation` To HITL Runtime

**Files:**
- Modify: `server/agent/humanGateTypes.ts`
- Modify: `server/agent/toolTypes.ts`
- Modify: `server/agent/toolExecutor.ts`
- Modify: `server/agent/agentRuntime.ts`
- Modify: `server/agent/agentRuntime.test.ts`

- [ ] **Step 1: Write the failing runtime test for planner-triggered parameter confirmation**

```ts
void test('planner can pause session.run_command on parameter_confirmation before any shell command is sent', async () => {
  let executedCommand: string | null = null;

  const runtime = createRuntimeForTest({
    executeCommand(_sessionId: string, command: string) {
      executedCommand = command;
      return Promise.resolve({
        sessionId: 'session-1',
        command,
        exitCode: 0,
        output: 'ok',
        truncated: false,
        startedAt: 1,
        completedAt: 2,
        durationMs: 1,
      });
    },
  });

  const events = await collectRunEvents(runtime, {
    task: '创建一个 root 权限用户',
    toolCalls: [
      {
        name: 'session.run_command',
        args: {
          sessionId: 'session-1',
          command: 'sudo adduser adminuser',
        },
      },
    ],
  });

  const gateEvent = events.find((event) => event.type === 'human_gate_opened');
  assert.equal(gateEvent?.gate.kind, 'parameter_confirmation');
  assert.equal(executedCommand, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`
Expected: FAIL because `parameter_confirmation` is not a valid gate kind and `toolExecutor` cannot pause this way yet.

- [ ] **Step 3: Extend gate and pause payload types**

```ts
export type ParameterConfirmationField = {
  name: ProtectedParameterName;
  label: string;
  value: string;
  required: boolean;
  source: ParameterSource;
};

export type ParameterConfirmationGatePayload = {
  toolCallId: string;
  toolName: 'session.run_command';
  command: string;
  intentKind: OpsClawIntentKind;
  fields: ParameterConfirmationField[];
};

export type HumanGateKind = 'terminal_input' | 'approval' | 'parameter_confirmation';
```

- [ ] **Step 4: Insert the planner before `session.run_command` execution**

```ts
const sessionPlan = buildSessionCommandPlan({
  command,
  effectiveRules,
  sessionGroupName,
  userTask: ctx.userTask,
});

if (sessionPlan.decision.kind === 'require_parameter_confirmation') {
  return {
    kind: 'pause',
    gateKind: 'parameter_confirmation',
    reason: '该变更缺少已确认的关键参数，需先由用户确认。',
    payload: {
      toolCallId,
      toolName: 'session.run_command',
      command,
      intentKind: sessionPlan.intent.kind,
      fields: sessionPlan.parameters.map(toConfirmationField),
    },
    continuation: {
      resume: async (confirmedFields, signal) => {
        const confirmedCommand = applyConfirmedParameters(command, confirmedFields);
        return this.executeSessionCommandWithPause(
          handler,
          toolCallId,
          { ...args, command: confirmedCommand },
          { ...ctx, signal: signal ?? ctx.signal },
          Date.now()
        ) as Promise<ToolExecutionEnvelope>;
      },
      reject: () => buildErrorEnvelope(
        handler.definition.name,
        toolCallId,
        '用户未确认关键参数，操作已取消。',
        Date.now(),
        'parameter_confirmation_rejected'
      ),
    },
  };
}
```

- [ ] **Step 5: Teach `agentRuntime.resolveGate()` to accept confirmed field values**

```ts
resolveGate(runId: string, gateId: string, input?: { fields?: Record<string, string> }) {
  const snapshot = this.agentRunRegistry.getRun(runId);
  if (snapshot?.openGate?.kind === 'parameter_confirmation') {
    pausedRun.pendingAction = {
      kind: 'resolve_parameter_confirmation',
      fields: input?.fields ?? {},
    };
    // continue existing run
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`
Expected: PASS with the new parameter confirmation test and existing HITL tests still green.

- [ ] **Step 7: Commit**

```bash
git add server/agent/humanGateTypes.ts server/agent/toolTypes.ts server/agent/toolExecutor.ts server/agent/agentRuntime.ts server/agent/agentRuntime.test.ts
git commit -m "feat: add parameter confirmation gate for session commands"
```

## Task 4: Add HTTP And Frontend Parameter Confirmation Flow

**Files:**
- Create: `src/features/workbench/agentParameterGateModel.ts`
- Create: `src/features/workbench/agentParameterGateModel.test.ts`
- Modify: `server/http/agentRoutes.ts`
- Modify: `server/http/agentRoutes.test.ts`
- Modify: `src/features/workbench/types.agent.ts`
- Modify: `src/features/workbench/agentApi.ts`
- Modify: `src/features/workbench/useAgentRun.ts`
- Modify: `src/features/workbench/useAgentRunModel.ts`
- Modify: `src/features/workbench/AiAssistantPanel.tsx`
- Modify: `src/features/workbench/agentGateUiModel.ts`
- Modify: `src/features/workbench/agentGateUiModel.test.ts`

- [ ] **Step 1: Write the failing frontend model test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildParameterGateFormState,
  validateParameterGateSubmission,
} from './agentParameterGateModel.js';

void test('parameter gate form requires required fields before submission', () => {
  const state = buildParameterGateFormState({
    fields: [
      { name: 'username', label: '用户名', value: '', required: true, source: 'agent_inferred' },
      { name: 'password', label: '密码', value: '', required: true, source: 'agent_inferred' },
    ],
  });

  assert.equal(validateParameterGateSubmission(state).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/features/workbench/agentParameterGateModel.test.ts`
Expected: FAIL because the model file does not exist yet.

- [ ] **Step 3: Add pure form-state helpers**

```ts
export function buildParameterGateFormState(input: {
  fields: ParameterConfirmationField[];
}) {
  return {
    values: Object.fromEntries(input.fields.map((field) => [field.name, field.value])),
    fields: input.fields,
  };
}

export function validateParameterGateSubmission(state: ParameterGateFormState) {
  const missing = state.fields.filter(
    (field) => field.required && !state.values[field.name]?.trim()
  );

  return missing.length > 0
    ? { ok: false as const, missing: missing.map((field) => field.name) }
    : { ok: true as const };
}
```

- [ ] **Step 4: Update the resolve gate HTTP route to accept field values**

```ts
app.post('/api/agent/runs/:runId/gates/:gateId/resolve', (request, response) => {
  const body = isRecord(request.body) ? request.body : {};
  const fields =
    isRecord(body.fields)
      ? Object.fromEntries(
          Object.entries(body.fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        )
      : undefined;

  const snapshot = agentRuntime.resolveGate(request.params.runId, request.params.gateId, {
    fields,
  });
  response.json(snapshot);
});
```

- [ ] **Step 5: Add the frontend API and panel form**

```ts
export async function resolveAgentGate(runId: string, gateId: string, input?: {
  fields?: Record<string, string>;
}) {
  return postJson(`/api/agent/runs/${runId}/gates/${gateId}/resolve`, input ?? {});
}
```

```tsx
{gate.kind === 'parameter_confirmation' ? (
  <form
    onSubmit={(event) => {
      event.preventDefault();
      const validation = validateParameterGateSubmission(formState);
      if (!validation.ok) {
        setError('请先填写所有必填参数。');
        return;
      }
      void onResolve(item.runId, gate.id, { fields: formState.values });
    }}
  >
    {gate.payload.fields.map((field) => (
      <label key={field.name} className="flex flex-col gap-1 text-xs">
        <span>{field.label}</span>
        <input
          type={field.name === 'password' ? 'password' : 'text'}
          value={formState.values[field.name] ?? ''}
          onChange={(event) => updateField(field.name, event.target.value)}
        />
      </label>
    ))}
    <button type="submit">确认参数并继续</button>
  </form>
) : null}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec tsx --test server/http/agentRoutes.test.ts src/features/workbench/agentParameterGateModel.test.ts src/features/workbench/agentGateUiModel.test.ts`
Expected: PASS with the new parameter form and route coverage green.

- [ ] **Step 7: Commit**

```bash
git add server/http/agentRoutes.ts server/http/agentRoutes.test.ts src/features/workbench/types.agent.ts src/features/workbench/agentApi.ts src/features/workbench/useAgentRun.ts src/features/workbench/useAgentRunModel.ts src/features/workbench/agentParameterGateModel.ts src/features/workbench/agentParameterGateModel.test.ts src/features/workbench/AiAssistantPanel.tsx src/features/workbench/agentGateUiModel.ts src/features/workbench/agentGateUiModel.test.ts
git commit -m "feat: add parameter confirmation UI and API flow"
```

## Task 5: Tighten Prompting And Verify The Full Vertical Slice

**Files:**
- Modify: `server/agent/agentPrompt.ts`
- Modify: `server/agent/toolExecutor.ts`
- Modify: `server/agent/sessionCommandPlanner.test.ts`
- Modify: `server/agent/agentRuntime.test.ts`

- [ ] **Step 1: Add the failing prompt-regression test**

```ts
void test('session command planner treats explicit usernames as user-provided and still requires approval for user management', () => {
  const plan = buildSessionCommandPlan({
    command: 'sudo adduser ops-admin',
    effectiveRules,
    sessionGroupName: null,
    userTask: '创建一个 root 权限用户，用户名叫 ops-admin',
  });

  assert.equal(plan.parameters[0]?.source, 'user_explicit');
  assert.equal(plan.decision.kind, 'require_approval');
});
```

- [ ] **Step 2: Run test to verify it fails if provenance logic is incomplete**

Run: `pnpm exec tsx --test server/agent/sessionCommandPlanner.test.ts`
Expected: FAIL until the planner correctly distinguishes explicit user parameters from inferred ones.

- [ ] **Step 3: Strengthen the agent system prompt**

```ts
'- 在执行任何变更前，先判断这是诊断、低风险变更还是危险变更。',
'- 用户名、密码、sudo 权限策略、写入目标、删除范围等关键参数不能自行编造。',
'- 若关键参数未由用户明确提供，必须先请求参数确认，不能直接执行 session.run_command。',
'- 即使生成了命令，也必须遵守参数确认和审批 gate，不能绕过。'
```

- [ ] **Step 4: Run the full verification suite**

Run: `pnpm exec tsx --test server/agent/opsclawRules.test.ts server/agent/sessionCommandPlanner.test.ts server/agent/agentRuntime.test.ts server/http/agentRoutes.test.ts src/features/workbench/agentParameterGateModel.test.ts src/features/workbench/agentGateUiModel.test.ts`
Expected: PASS with all new and existing phase tests green.

- [ ] **Step 5: Run type checks**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json`
Expected: PASS

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/agent/agentPrompt.ts server/agent/toolExecutor.ts server/agent/sessionCommandPlanner.test.ts server/agent/agentRuntime.test.ts
git commit -m "feat: enforce controlled execution prompt and planner flow"
```

## Self-Review

### Spec Coverage

Covered in this plan:

- native `opsclaw.rules.yaml` and `opsclaw.policy.md`
- global plus group-level rule scope
- intent-first evaluation
- protected parameter provenance
- `parameter_confirmation` gate
- conversation-first user confirmation flow
- low-risk auto execution vs risky approval/confirmation split

Deferred to later plans:

- planner support for tools beyond `session.run_command`
- full audit and detail views
- broader verification/audit persistence model
- richer intent families and group management UX

### Placeholder Scan

No `TODO`, `TBD`, or "implement later" placeholders remain. Every task includes concrete files, tests, commands, and code skeletons.

### Type Consistency

The plan consistently uses:

- `OpsClawIntentKind`
- `ParameterSource`
- `ParameterConfirmationGatePayload`
- `buildSessionCommandPlan()`
- `resolveGate(..., { fields })`

No later task introduces conflicting names for those concepts.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-07-agent-v2-controlled-execution-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
