# Agent Command Policy P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current scattered dangerous-command heuristics with a centralized, explainable command-policy layer that can consistently `allow`, `deny`, or `require_approval`, and surface matched rule IDs/reasons to the frontend timeline.

**Architecture:** Keep the existing `session.run_command -> toolPolicy -> toolExecutor -> SSE -> React timeline` path, but move shell-risk detection into a dedicated command-policy module with a stable rule catalog. `sessionProvider.ts` stops carrying its own ad hoc approval keywords, `toolPolicy.ts` becomes an orchestration layer, and the SSE/frontend payloads gain structured policy metadata so users can see exactly which rule blocked or escalated a command.

**Tech Stack:** TypeScript, Node.js, SSE streaming, React, node:test, tsx

---

### Scope

This P0 includes:
- centralized shell command rule catalog
- stable `ruleId` / `title` / `reason` / `action` metadata
- shared evaluation path for `session.run_command`
- structured `approval_required` and denied-result payloads
- frontend timeline visibility for matched rules
- runtime, server, and frontend regression coverage

This P0 explicitly does **not** include:
- approve/reject 后继续运行的真正交互式审批续跑
- shell AST 级别解析
- 组织级 RBAC / policy 下发 / 审计落库
- per-node / per-team 自定义策略配置

### Task 1: Lock P0 Semantics With Targeted Tests

**Files:**
- Create: `server/agent/commandPolicy.test.ts`
- Modify: `server/agent/agentRuntime.test.ts`
- Test: `server/agent/commandPolicy.test.ts`
- Test: `server/agent/agentRuntime.test.ts`

- [ ] **Step 1: Write the failing server policy tests**

Add `server/agent/commandPolicy.test.ts` covering these concrete cases:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateSessionCommandPolicy } from './commandPolicy.js';

void test('allows readonly shell commands in auto-readonly mode', () => {
  const decision = evaluateSessionCommandPolicy({
    approvalMode: 'auto-readonly',
    command: 'ls -la /var/log',
  });

  assert.equal(decision.kind, 'allow');
});

void test('denies destructive delete commands in auto-readonly mode with stable rule ids', () => {
  const decision = evaluateSessionCommandPolicy({
    approvalMode: 'auto-readonly',
    command: 'rm -rf /tmp/demo',
  });

  assert.equal(decision.kind, 'deny');
  assert.equal(decision.matches[0]?.ruleId, 'shell.delete.recursive');
});

void test('requires approval for service restart in manual-sensitive mode', () => {
  const decision = evaluateSessionCommandPolicy({
    approvalMode: 'manual-sensitive',
    command: 'systemctl restart nginx',
  });

  assert.equal(decision.kind, 'require_approval');
  assert.equal(decision.matches[0]?.ruleId, 'service.restart');
});
```

- [ ] **Step 2: Extend runtime test coverage for SSE payload shape**

Add one runtime test in `server/agent/agentRuntime.test.ts` that forces `session.run_command` to emit `approval_required`, and assert the event includes stable policy details:

```ts
assert.deepEqual(approvalEvent, {
  type: 'approval_required',
  runId: 'run-1',
  step: 1,
  toolCallId: 'call-1',
  toolName: 'session.run_command',
  reason: '命令命中敏感操作策略，需要用户审批后执行。',
  policy: {
    action: 'require_approval',
    matches: [
      {
        ruleId: 'service.restart',
        title: '服务重启',
      },
    ],
  },
  timestamp: approvalEvent.timestamp,
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec tsx --test server/agent/commandPolicy.test.ts server/agent/agentRuntime.test.ts`
Expected: FAIL because `commandPolicy.ts` does not exist yet and SSE events do not include structured `policy`.

- [ ] **Step 4: Commit the red test baseline**

```bash
git add server/agent/commandPolicy.test.ts server/agent/agentRuntime.test.ts
git commit -m "test: define agent command policy p0 behavior"
```

### Task 2: Introduce A Central Command Policy Module

**Files:**
- Create: `server/agent/commandPolicy.ts`
- Modify: `server/agent/toolTypes.ts`
- Modify: `server/agent/toolPolicy.ts`
- Modify: `server/agent/tools/sessionProvider.ts`
- Test: `server/agent/commandPolicy.test.ts`

- [ ] **Step 1: Add the shared command-policy types and catalog**

Create `server/agent/commandPolicy.ts` with a stable catalog and evaluator:

```ts
import type { AgentApprovalMode } from './agentTypes.js';

export type CommandPolicyAction = 'allow' | 'deny' | 'require_approval';

export type CommandPolicyMatch = {
  ruleId: string;
  title: string;
  severity: 'medium' | 'high' | 'critical';
  reason: string;
  matchedText: string;
};

export type CommandPolicyDecision = {
  kind: CommandPolicyAction;
  reason?: string;
  matches: CommandPolicyMatch[];
};

type SessionCommandPolicyInput = {
  approvalMode: AgentApprovalMode;
  command: string;
};

const COMMAND_RULES = [
  {
    ruleId: 'shell.delete.recursive',
    title: '递归删除',
    severity: 'critical',
    action: 'require_approval',
    reason: '命令包含递归删除，可能造成不可逆数据丢失。',
    pattern: /\brm\s+-rf\b/i,
  },
  {
    ruleId: 'filesystem.format',
    title: '磁盘格式化',
    severity: 'critical',
    action: 'require_approval',
    reason: '命令包含磁盘格式化，风险极高。',
    pattern: /\bmkfs\b/i,
  },
  {
    ruleId: 'service.restart',
    title: '服务重启',
    severity: 'high',
    action: 'require_approval',
    reason: '命令会重启或停止服务，可能影响在线流量。',
    pattern: /\b(systemctl|service)\s+(start|restart|stop)\b/i,
  },
];

export function evaluateSessionCommandPolicy(
  input: SessionCommandPolicyInput
): CommandPolicyDecision {
  const matches = COMMAND_RULES
    .map(rule => {
      const matchedText = input.command.match(rule.pattern)?.[0];
      if (!matchedText) {
        return null;
      }

      return {
        ruleId: rule.ruleId,
        title: rule.title,
        severity: rule.severity,
        reason: rule.reason,
        matchedText,
        action: rule.action,
      };
    })
    .filter(Boolean);

  if (matches.length === 0) {
    return { kind: 'allow', matches: [] };
  }

  const reason = matches.map(match => match.reason).join('；');
  if (input.approvalMode === 'manual-sensitive') {
    return { kind: 'require_approval', reason, matches };
  }

  return { kind: 'deny', reason, matches };
}
```

- [ ] **Step 2: Extend shared tool-policy types**

In `server/agent/toolTypes.ts`, replace the current minimal union with structured metadata:

```ts
export type ToolPolicyMatch = {
  ruleId: string;
  title: string;
  severity: 'medium' | 'high' | 'critical';
  reason: string;
  matchedText?: string;
};

export type ToolPolicyDecision =
  | { kind: 'allow'; matches?: ToolPolicyMatch[] }
  | { kind: 'deny'; reason: string; matches: ToolPolicyMatch[] }
  | { kind: 'require_approval'; reason: string; matches: ToolPolicyMatch[] };
```

- [ ] **Step 3: Refactor `toolPolicy.ts` to delegate command checks**

Update `server/agent/toolPolicy.ts` so tool-level dangerous checks still work, but `session.run_command` uses the new evaluator instead of hard-coded regex plus duplicate tool-local keywords:

```ts
import { evaluateSessionCommandPolicy } from './commandPolicy.js';

if (tool.definition.name === 'session.run_command') {
  const command = readCommandArgument(args);
  if (command) {
    return evaluateSessionCommandPolicy({
      approvalMode: ctx.approvalMode,
      command,
    });
  }
}
```

- [ ] **Step 4: Remove scattered command heuristics from `sessionProvider.ts`**

Delete the current `requiresApproval` keyword list from `session.run_command` and keep the tool definition focused on execution only:

```ts
definition: {
  name: 'session.run_command',
  description: '在指定 SSH 会话中执行一条 shell 命令，并返回退出码与输出。',
  parameters: runCommandArgsSchema,
  category: 'session',
  riskLevel: 'caution',
  concurrencyMode: 'session-exclusive',
  version: '1.0.0',
  tags: ['session', 'command'],
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec tsx --test server/agent/commandPolicy.test.ts server/agent/agentRuntime.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the policy-engine refactor**

```bash
git add server/agent/commandPolicy.ts server/agent/toolTypes.ts server/agent/toolPolicy.ts server/agent/tools/sessionProvider.ts server/agent/commandPolicy.test.ts server/agent/agentRuntime.test.ts
git commit -m "feat: centralize agent command policy rules"
```

### Task 3: Carry Structured Policy Metadata Through Runtime And Transport

**Files:**
- Modify: `server/agent/agentTypes.ts`
- Modify: `server/agent/toolExecutor.ts`
- Modify: `server/agent/agentRuntime.test.ts`
- Test: `server/agent/agentRuntime.test.ts`

- [ ] **Step 1: Extend agent transport types**

Update `server/agent/agentTypes.ts` to carry structured policy details on approval and failed tool results:

```ts
export type AgentPolicySummary = {
  action: 'deny' | 'require_approval';
  matches: Array<{
    ruleId: string;
    title: string;
    severity: 'medium' | 'high' | 'critical';
    reason: string;
    matchedText?: string;
  }>;
};
```

Add `policy?: AgentPolicySummary` to:
- `ToolExecutionEnvelope.meta`
- `approval_required` events

- [ ] **Step 2: Attach policy metadata in `toolExecutor.ts`**

When the decision is `deny` or `require_approval`, preserve `matches` in the emitted event and returned envelope:

```ts
if (decision.kind === 'require_approval') {
  const policy = {
    action: 'require_approval' as const,
    matches: decision.matches,
  };

  ctx.emit({
    type: 'approval_required',
    runId: ctx.runId,
    step: ctx.step,
    toolCallId,
    toolName: handler.definition.name,
    reason: decision.reason,
    policy,
    timestamp: startedAt,
  });

  return buildErrorEnvelope(
    handler.definition.name,
    toolCallId,
    `${decision.reason} 当前版本尚未提供交互审批流程。`,
    startedAt,
    'approval_required',
    {
      approvalRequired: true,
      policy,
    }
  );
}
```

- [ ] **Step 3: Extend the error-envelope helper**

Change `buildErrorEnvelope()` to accept structured policy metadata:

```ts
function buildErrorEnvelope(
  toolName: string,
  toolCallId: string,
  message: string,
  startedAt: number,
  code = 'tool_execution_failed',
  options?: {
    retryable?: boolean;
    approvalRequired?: boolean;
    policy?: AgentPolicySummary;
  }
) {
  // keep existing shape, but persist options?.policy into meta.policy
}
```

- [ ] **Step 4: Add regression assertions**

In `server/agent/agentRuntime.test.ts`, assert both paths:
- `approval_required` event carries `policy.matches[0].ruleId`
- `tool_execution_finished.result.meta.policy.matches[0].ruleId` is preserved for the same tool call

- [ ] **Step 5: Run tests**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the transport change**

```bash
git add server/agent/agentTypes.ts server/agent/toolExecutor.ts server/agent/agentRuntime.test.ts
git commit -m "feat: expose agent policy metadata in runtime events"
```

### Task 4: Surface Policy Matches In The Frontend Timeline

**Files:**
- Modify: `src/features/workbench/types.agent.ts`
- Modify: `src/features/workbench/useAgentRun.ts`
- Modify: `src/features/workbench/AiAssistantPanel.tsx`
- Create: `src/features/workbench/agentPolicyUiModel.ts`
- Create: `src/features/workbench/agentPolicyUiModel.test.ts`
- Test: `src/features/workbench/agentPolicyUiModel.test.ts`

- [ ] **Step 1: Add the failing UI-model tests**

Create `src/features/workbench/agentPolicyUiModel.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAgentPolicySummary } from './agentPolicyUiModel.js';

void test('formats matched policy ids and titles for warning cards', () => {
  assert.equal(
    formatAgentPolicySummary({
      action: 'deny',
      matches: [
        {
          ruleId: 'shell.delete.recursive',
          title: '递归删除',
          severity: 'critical',
          reason: '命令包含递归删除，可能造成不可逆数据丢失。',
          matchedText: 'rm -rf',
        },
      ],
    }),
    '已命中策略：shell.delete.recursive（递归删除）'
  );
});
```

- [ ] **Step 2: Update shared frontend types**

Mirror the new backend `policy` shape in `src/features/workbench/types.agent.ts`, and extend warning items so they can preserve policy metadata:

```ts
export type AgentPolicySummary = {
  action: 'deny' | 'require_approval';
  matches: Array<{
    ruleId: string;
    title: string;
    severity: 'medium' | 'high' | 'critical';
    reason: string;
    matchedText?: string;
  }>;
};
```

- [ ] **Step 3: Normalize timeline items in `useAgentRun.ts`**

When the stream receives `approval_required`, persist the structured policy instead of collapsing everything into plain text:

```ts
if (event.type === 'approval_required') {
  appendItem({
    id: createItemId(),
    kind: 'warning',
    text: `工具 ${event.toolName} 需要审批：${event.reason}`,
    step: event.step,
    policy: event.policy,
  });
  return;
}
```

For `tool_execution_finished`, when `result.ok === false` and `result.meta.policy` exists, keep that metadata in the rendered item as well.

- [ ] **Step 4: Render explainable policy chips in `AiAssistantPanel.tsx`**

Add a tiny UI helper and show stable matches on warning / denied-result cards:

```ts
export function formatAgentPolicySummary(policy: AgentPolicySummary | undefined) {
  if (!policy || policy.matches.length === 0) {
    return null;
  }

  return `已命中策略：${policy.matches
    .map(match => `${match.ruleId}（${match.title}）`)
    .join('、')}`;
}
```

Then render:

```tsx
{policySummary ? (
  <div className="mt-2 text-xs text-[var(--app-text-secondary)]">{policySummary}</div>
) : null}
```

- [ ] **Step 5: Run tests and type checks**

Run: `pnpm exec tsx --test src/features/workbench/agentPolicyUiModel.test.ts`
Expected: PASS

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: PASS

- [ ] **Step 6: Commit the frontend explainability layer**

```bash
git add src/features/workbench/types.agent.ts src/features/workbench/useAgentRun.ts src/features/workbench/AiAssistantPanel.tsx src/features/workbench/agentPolicyUiModel.ts src/features/workbench/agentPolicyUiModel.test.ts
git commit -m "feat: show agent policy matches in assistant timeline"
```

### Task 5: Regression Verification And Delivery Gate

**Files:**
- Modify: `docs/superpowers/plans/2026-04-02-agent-command-policy-p0.md` (only if verification notes need correction)
- Test: `server/agent/commandPolicy.test.ts`
- Test: `server/agent/agentRuntime.test.ts`
- Test: `src/features/workbench/agentPolicyUiModel.test.ts`

- [ ] **Step 1: Run targeted server tests**

Run: `pnpm exec tsx --test server/agent/commandPolicy.test.ts server/agent/agentRuntime.test.ts`
Expected: PASS

- [ ] **Step 2: Run targeted frontend tests**

Run: `pnpm exec tsx --test src/features/workbench/agentPolicyUiModel.test.ts`
Expected: PASS

- [ ] **Step 3: Run static checks**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: PASS

Run: `pnpm exec tsc --noEmit -p tsconfig.node.json`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 5: Manual regression checklist**

Verify in the workbench:
- agent mode with `ls -la` still runs normally
- agent mode with `rm -rf /tmp/demo` shows a denied result with visible policy rule ID
- manual-sensitive mode with `systemctl restart nginx` emits `approval_required` and shows matched rule text in the timeline
- chat mode remains unaffected

- [ ] **Step 6: Commit the verified P0 delivery**

```bash
git add docs/superpowers/plans/2026-04-02-agent-command-policy-p0.md
git commit -m "docs: finalize agent command policy p0 plan"
```

---

## Current Status

- Automated verification is complete as of `2026-04-02`.
- The command policy path is now covered by:
  - `server/agent/commandPolicy.test.ts`
  - `server/agent/agentRuntime.test.ts`
  - `src/features/workbench/agentPolicyUiModel.test.ts`
  - `src/features/workbench/useAgentRunModel.test.ts`
- Verified commands:
  - `pnpm exec tsx --test server/agent/commandPolicy.test.ts server/agent/agentRuntime.test.ts`
  - `pnpm exec tsx --test src/features/workbench/agentPolicyUiModel.test.ts`
  - `pnpm exec tsx --test src/features/workbench/useAgentRunModel.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.app.json`
  - `pnpm exec tsc --noEmit -p tsconfig.node.json`
  - `pnpm exec tsc --noEmit -p tsconfig.electron.json`
  - `pnpm lint`
- Remaining P0 work is limited to:
  - manual workbench regression for the four UI scenarios above
  - commit segmentation / final delivery commit

## Post-P0 Follow-Ups

After this P0 lands, the next two follow-up tracks should be split out rather than混在本计划里：

1. **P1: Interactive approval continuation**
   - suspend run on `approval_required`
   - frontend approve/reject action
   - resume from pending tool call instead of terminating run

2. **P2: Enterprise policy control plane**
   - policy versioning and rollout
   - org/team/node overrides
   - audit trail and SIEM export
   - sandbox / execution policy convergence
