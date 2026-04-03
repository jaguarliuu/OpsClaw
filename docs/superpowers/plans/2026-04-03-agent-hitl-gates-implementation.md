# Agent HITL Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified in-memory HITL gate system so agent runs can pause on terminal interaction or approval, suspend on timeout, and resume without losing run identity or execution context.

**Architecture:** Introduce shared HITL run/gate types plus an in-memory `AgentRunRegistry`, teach `SessionRegistry` and `ToolExecutor` to emit pause-capable outcomes instead of collapsing them into failures, then wire HTTP/SSE continuation and frontend timeline plus terminal-lock UX on top of the new runtime states. The implementation should preserve the current `session.run_command` execution path where possible, while promoting human waiting into a first-class state machine.

**Tech Stack:** TypeScript, Node.js, Express SSE, React 19, node:test, tsx

---

## File Map

### New Files

- `server/agent/humanGateTypes.ts`
  - Shared run-state, gate-state, gate-kind, and pause-result types used by runtime, registry, and HTTP routes.
- `server/agent/agentRunRegistry.ts`
  - In-memory run/gate registry for resumable runs and gate actions.
- `server/agent/agentRunRegistry.test.ts`
  - Unit coverage for run/gate lifecycle state transitions.
- `server/http/agentRoutes.test.ts`
  - HTTP and SSE continuation coverage for gate actions and resumed runs.
- `src/features/workbench/agentGateUiModel.ts`
  - Pure formatting and affordance helpers for HITL cards and terminal banners.
- `src/features/workbench/agentGateUiModel.test.ts`
  - Unit coverage for gate UI rendering decisions and labels.

### Existing Files To Modify

- `server/agent/sessionRegistry.ts`
  - Add interactive pending execution state machine and resumable wait behavior.
- `server/agent/sessionRegistry.test.ts`
  - Extend tests for awaiting-input, suspension, and resume.
- `server/agent/toolExecutor.ts`
  - Return pause-aware outcomes for approval and terminal-input gates.
- `server/agent/toolTypes.ts`
  - Expand tool execution result types to include paused/gated outcomes.
- `server/agent/agentTypes.ts`
  - Add new SSE event types and shared payloads for run state and human gates.
- `server/agent/agentRuntime.ts`
  - Own gate lifecycle, run state transitions, suspension, and continuation.
- `server/agent/agentRuntime.test.ts`
  - Cover gate opening, expiration, resolution, rejection, and resumed execution.
- `server/http/agentRoutes.ts`
  - Add gate action endpoints and resumed SSE stream wiring.
- `server/terminalGateway.ts`
  - Surface terminal-input gate state to the session lock path if needed.
- `src/features/workbench/types.agent.ts`
  - Add frontend run/gate event and data types.
- `src/features/workbench/agentApi.ts`
  - Add gate action APIs and resumed stream handling.
- `src/features/workbench/useAgentRun.ts`
  - Persist run/gate state across suspended and resumed streams.
- `src/features/workbench/useAgentRunModel.ts`
  - Map new gate and run-state events into timeline items.
- `src/features/workbench/useAgentRunModel.test.ts`
  - Extend timeline mapping coverage.
- `src/features/workbench/AiAssistantPanel.tsx`
  - Render HITL cards and approval/resume actions.
- `src/features/workbench/SshTerminalPane.tsx`
  - Render terminal lock banner for active/suspended terminal-input gates.
- `src/features/workbench/types.ts`
  - Add session lock/banner shape if stored in shared workbench state.
- `src/features/workbench/useSshTerminalRuntime.ts`
  - Disable conflicting terminal affordances while a session is agent-locked.
- `src/features/workbench/useWorkbenchShellState.ts`
  - Only if a shared shell-level suspended gate indicator is needed.

## Task 1: Define Shared HITL Types And Registry

**Files:**
- Create: `server/agent/humanGateTypes.ts`
- Create: `server/agent/agentRunRegistry.ts`
- Create: `server/agent/agentRunRegistry.test.ts`
- Modify: `server/agent/agentTypes.ts`
- Modify: `src/features/workbench/types.agent.ts`

- [ ] **Step 1: Write the failing registry and type tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentRunRegistry,
  type HumanGateRecord,
} from './agentRunRegistry.js';

void test('opens a terminal_input gate and moves the run to waiting_for_human', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check interactive command',
  });

  const gate = registry.openGate({
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'terminal_input',
    reason: '命令正在等待用户在终端中继续输入。',
    deadlineAt: 1_700_000_000_000,
    payload: {
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      command: 'sudo passwd root',
      timeoutMs: 300000,
    },
  });

  const snapshot = registry.getRun('run-1');
  assert.equal(snapshot?.state, 'waiting_for_human');
  assert.equal(gate.kind, 'terminal_input');
  assert.equal(gate.status, 'open');
});

void test('expiring a gate suspends the run instead of failing it', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'wait for input',
  });

  const gate = registry.openGate({
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'terminal_input',
    reason: '命令正在等待用户在终端中继续输入。',
    deadlineAt: 1_700_000_000_000,
    payload: {
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      command: 'sudo passwd root',
      timeoutMs: 300000,
    },
  });

  registry.expireGate({ runId: 'run-1', gateId: gate.id });
  const snapshot = registry.getRun('run-1');

  assert.equal(snapshot?.state, 'suspended');
  assert.equal(snapshot?.openGate?.status, 'expired');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test server/agent/agentRunRegistry.test.ts`
Expected: FAIL because `agentRunRegistry.ts` and HITL types do not exist yet.

- [ ] **Step 3: Add shared HITL type definitions**

```ts
export type AgentRunState =
  | 'running'
  | 'waiting_for_human'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type HumanGateKind = 'terminal_input' | 'approval';
export type HumanGateStatus = 'open' | 'resolved' | 'rejected' | 'expired';

export type TerminalInputGatePayload = {
  toolCallId: string;
  toolName: 'session.run_command';
  command: string;
  sessionLabel?: string;
  timeoutMs: number;
};

export type ApprovalGatePayload = {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  policy: AgentPolicySummary;
};

export type HumanGatePayload = TerminalInputGatePayload | ApprovalGatePayload;
```

- [ ] **Step 4: Implement the in-memory run and gate registry**

```ts
type AgentRunRecord = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  openGate: HumanGateRecord | null;
};

export function createAgentRunRegistry() {
  const runs = new Map<string, AgentRunRecord>();

  return {
    registerRun(input: { runId: string; sessionId: string; task: string }) {
      runs.set(input.runId, {
        ...input,
        state: 'running',
        openGate: null,
      });
    },
    openGate(input: OpenHumanGateInput) {
      const run = runs.get(input.runId);
      if (!run) throw new Error('Agent run 不存在。');
      if (run.openGate && run.openGate.status === 'open') {
        throw new Error('当前 run 已存在未完成的 human gate。');
      }

      const gate: HumanGateRecord = {
        id: crypto.randomUUID(),
        ...input,
        status: 'open',
        openedAt: Date.now(),
      };
      run.state = 'waiting_for_human';
      run.openGate = gate;
      return gate;
    },
    expireGate(input: { runId: string; gateId: string }) {
      const run = runs.get(input.runId);
      if (!run?.openGate || run.openGate.id !== input.gateId) {
        throw new Error('指定 human gate 不存在。');
      }
      run.openGate.status = 'expired';
      run.state = 'suspended';
    },
    getRun(runId: string) {
      return runs.get(runId) ?? null;
    },
  };
}
```

- [ ] **Step 5: Extend shared agent event types on both server and frontend**

```ts
export type AgentStreamEvent =
  | { type: 'run_state_changed'; runId: string; state: AgentRunState; timestamp: number }
  | {
      type: 'human_gate_opened';
      runId: string;
      gate: HumanGateRecord;
      timestamp: number;
    }
  | {
      type: 'human_gate_expired';
      runId: string;
      gate: HumanGateRecord;
      timestamp: number;
    };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec tsx --test server/agent/agentRunRegistry.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/agent/humanGateTypes.ts server/agent/agentRunRegistry.ts server/agent/agentRunRegistry.test.ts server/agent/agentTypes.ts src/features/workbench/types.agent.ts
git commit -m "feat: add shared agent hitl gate types"
```

## Task 2: Make SessionRegistry Preserve Interactive Command State

**Files:**
- Modify: `server/agent/sessionRegistry.ts`
- Modify: `server/agent/sessionRegistry.test.ts`

- [ ] **Step 1: Write failing tests for suspension and resume of terminal-input waits**

```ts
void test('interactive command timeout suspends pending execution instead of rejecting it permanently', async () => {
  const registry = new SessionRegistry();
  const sentPayloads: string[] = [];

  registry.registerSession({
    sessionId: 'session-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    sendInput(payload) {
      sentPayloads.push(payload);
    },
  });
  registry.updateSessionStatus('session-1', 'connected');

  const execution = registry.executeCommand('session-1', 'python interactive.py', {
    timeoutMs: 20,
    humanInputTimeoutMs: 30,
  } as never);

  await new Promise(resolve => setTimeout(resolve, 0));
  const markers = extractMarkers(sentPayloads[0] ?? '');
  registry.appendTerminalData('session-1', `\\n${markers.startMarker}\\nPassword: `);
  (registry as never as { noteUserInput: (sessionId: string, payload: string) => void }).noteUserInput(
    'session-1',
    'secret\\n'
  );

  await new Promise(resolve => setTimeout(resolve, 60));

  const snapshot = (
    registry as never as { getPendingExecutionDebug: (sessionId: string) => { state: string } | null }
  ).getPendingExecutionDebug('session-1');
  assert.equal(snapshot?.state, 'suspended_waiting_for_input');

  void execution.catch(() => undefined);
});

void test('resumePendingExecutionWait re-arms the suspended wait and allows later completion', async () => {
  // same setup as above, then call resumePendingExecutionWait('session-1')
  // then append terminal output ending in the original end marker and assert the original promise resolves
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test server/agent/sessionRegistry.test.ts`
Expected: FAIL because suspended pending execution and resume APIs do not exist yet.

- [ ] **Step 3: Add explicit pending execution state and debug-safe inspection helpers**

```ts
type PendingExecutionState =
  | 'running'
  | 'awaiting_human_input'
  | 'suspended_waiting_for_input'
  | 'completed'
  | 'failed';

type PendingExecution = {
  state: PendingExecutionState;
  command: string;
  startedAt: number;
  startMarker: string;
  endMarkerPrefix: string;
  // existing fields preserved
};

getPendingExecutionDebug(sessionId: string) {
  const session = this.sessions.get(sessionId);
  if (!session?.pendingExecution) {
    return null;
  }
  return {
    state: session.pendingExecution.state,
    command: session.pendingExecution.command,
    startMarker: session.pendingExecution.startMarker,
  };
}
```

- [ ] **Step 4: Mark interactive commands as awaiting human input and suspend them on timeout instead of clearing them**

```ts
noteUserInput(sessionId: string, payload: string) {
  const session = this.sessions.get(sessionId);
  if (!session?.pendingExecution || !payload) {
    return;
  }

  const pendingExecution = session.pendingExecution;
  if (pendingExecution.state === 'running') {
    pendingExecution.state = 'awaiting_human_input';
  }

  // existing input redaction logic stays in place
  this.schedulePendingExecutionTimeout(
    session,
    pendingExecution,
    pendingExecution.humanInputTimeoutMs,
    '命令等待人工输入超时，Agent 已停止主动等待。',
    'execute_command_human_input_timeout'
  );
}

private schedulePendingExecutionTimeout(...) {
  // on human-input timeout: set state to 'suspended_waiting_for_input'
  // do not clear session.pendingExecution
  // reject/resolve will be handled by runtime-level gate orchestration
}
```

- [ ] **Step 5: Add an explicit resume API on SessionRegistry**

```ts
resumePendingExecutionWait(sessionId: string, timeoutMs: number) {
  const session = this.sessions.get(sessionId);
  const pendingExecution = session?.pendingExecution;
  if (!session || !pendingExecution || pendingExecution.state !== 'suspended_waiting_for_input') {
    throw new Error('当前会话没有可恢复的交互命令等待。');
  }

  pendingExecution.state = 'awaiting_human_input';
  this.schedulePendingExecutionTimeout(
    session,
    pendingExecution,
    timeoutMs,
    '命令等待人工输入超时，Agent 已停止主动等待。',
    'execute_command_human_input_timeout'
  );
}
```

- [ ] **Step 6: Ensure completion still resolves the original promise and clears the lock**

```ts
private processPendingExecutionChunk(session: SessionEntry, chunk: string) {
  // existing marker detection remains
  if (!markerMatch) {
    return;
  }

  pendingExecution.state = 'completed';
  clearTimeout(pendingExecution.timeoutId);
  pendingExecution.cleanupAbortListener?.();
  session.pendingExecution = null;
  pendingExecution.resolve({
    sessionId: session.sessionId,
    command: pendingExecution.command,
    exitCode: markerMatch.exitCode,
    output,
    truncated,
    startedAt: pendingExecution.startedAt,
    completedAt,
    durationMs: completedAt - pendingExecution.startedAt,
  });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm exec tsx --test server/agent/sessionRegistry.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/agent/sessionRegistry.ts server/agent/sessionRegistry.test.ts
git commit -m "feat: preserve suspended interactive session waits"
```

## Task 3: Make Tool Execution And Agent Runtime Pause-Aware

**Files:**
- Modify: `server/agent/toolTypes.ts`
- Modify: `server/agent/toolExecutor.ts`
- Modify: `server/agent/agentRuntime.ts`
- Modify: `server/agent/agentRuntime.test.ts`

- [ ] **Step 1: Write failing runtime tests for gate opening, expiration, and approval pause**

```ts
test('interactive session input opens a terminal_input gate instead of failing the run', async () => {
  const events: AgentStreamEvent[] = [];

  await runtime.run(
    {
      providerId: 'provider-1',
      provider,
      model: 'qwen-plus',
      task: 'set root password',
      sessionId: 'session-1',
    },
    (event) => events.push(event),
    new AbortController().signal
  );

  assert.equal(events.some(event => event.type === 'human_gate_opened'), true);
  assert.equal(events.some(event => event.type === 'run_failed'), false);
});

test('approval gate opens and waits instead of producing approval_required tool failure', async () => {
  // assert human_gate_opened(kind=approval) plus run_state_changed(waiting_for_human)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`
Expected: FAIL because runtime still emits `approval_required` and treats pauses as failures.

- [ ] **Step 3: Expand tool execution result types to include pause outcomes**

```ts
export type ToolPauseOutcome = {
  kind: 'pause';
  gateKind: 'terminal_input' | 'approval';
  reason: string;
  payload: Record<string, unknown>;
};

export type ToolExecutionResult =
  | { kind: 'success'; envelope: ToolExecutionEnvelope }
  | { kind: 'failure'; envelope: ToolExecutionEnvelope }
  | ToolPauseOutcome;
```

- [ ] **Step 4: Update ToolExecutor to return pause outcomes for approval gates**

```ts
if (decision.kind === 'require_approval') {
  return {
    kind: 'pause',
    gateKind: 'approval',
    reason: decision.reason,
    payload: {
      toolCallId,
      toolName: handler.definition.name,
      arguments: args as Record<string, unknown>,
      policy: {
        action: 'require_approval',
        matches: decision.matches,
      },
    },
  };
}
```

- [ ] **Step 5: Teach AgentRuntime to open human gates and emit run-state transitions**

```ts
const registry = this.dependencies.agentRunRegistry;
registry.registerRun({
  runId,
  sessionId: input.sessionId,
  task: input.task,
});

emit({
  type: 'run_state_changed',
  runId,
  state: 'running',
  timestamp: Date.now(),
});

// later, when a pause outcome is returned:
const gate = registry.openGate({
  runId,
  sessionId: input.sessionId,
  kind: pause.gateKind,
  reason: pause.reason,
  deadlineAt: Date.now() + resolveGateTimeoutMs(pause.gateKind),
  payload: pause.payload,
});
emit({ type: 'human_gate_opened', runId, gate, timestamp: Date.now() });
emit({ type: 'run_state_changed', runId, state: 'waiting_for_human', timestamp: Date.now() });
return;
```

- [ ] **Step 6: Convert terminal-input interactive waits into pause outcomes**

```ts
const result = await handler.execute(args, ctx);

if (isSessionCommandAwaitingHumanInput(result)) {
  return {
    kind: 'pause',
    gateKind: 'terminal_input',
    reason: '命令正在等待你在终端中继续输入。',
    payload: {
      toolCallId,
      toolName: handler.definition.name,
      command: result.command,
      timeoutMs: result.humanInputTimeoutMs,
    },
  };
}
```

- [ ] **Step 7: Add runtime resume hooks for resolved and expired gates**

```ts
async resumeSuspendedRun(runId: string, gateId: string) {
  const run = this.dependencies.agentRunRegistry.getRun(runId);
  if (!run?.openGate || run.openGate.id !== gateId) {
    throw new Error('指定的 human gate 不存在。');
  }

  if (run.openGate.kind !== 'terminal_input') {
    throw new Error('只有 terminal_input gate 支持继续等待。');
  }

  this.dependencies.sessions.resumePendingExecutionWait(run.sessionId, DEFAULT_HUMAN_INPUT_TIMEOUT_MS);
  this.dependencies.agentRunRegistry.markGateReopened({ runId, gateId });
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add server/agent/toolTypes.ts server/agent/toolExecutor.ts server/agent/agentRuntime.ts server/agent/agentRuntime.test.ts
git commit -m "feat: add pause-aware agent runtime and tool execution"
```

## Task 4: Add HTTP Gate Actions And SSE Continuation

**Files:**
- Modify: `server/http/agentRoutes.ts`
- Create: `server/http/agentRoutes.test.ts`
- Modify: `src/features/workbench/agentApi.ts`

- [ ] **Step 1: Write failing HTTP tests for approval actions and resume-waiting**

```ts
void test('resume-waiting returns 200 and resumes a suspended terminal_input gate', async () => {
  // create app with fake runtime and fake registry
  // POST /api/agent/runs/run-1/gates/gate-1/resume-waiting
  // assert 200 and body.state === 'waiting_for_human'
});

void test('reject returns 200 and rejects an approval gate', async () => {
  // POST /api/agent/runs/run-1/gates/gate-1/reject
  // assert 200 and body.gate.status === 'rejected'
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test server/http/agentRoutes.test.ts`
Expected: FAIL because the gate action endpoints do not exist yet.

- [ ] **Step 3: Add gate action routes**

```ts
app.post('/api/agent/runs/:runId/gates/:gateId/resume-waiting', async (request, response) => {
  const { runId, gateId } = request.params;
  const snapshot = await agentRuntime.resumeWaiting(runId, gateId);
  response.json(snapshot);
});

app.post('/api/agent/runs/:runId/gates/:gateId/resolve', async (request, response) => {
  const { runId, gateId } = request.params;
  const snapshot = await agentRuntime.resolveGate(runId, gateId);
  response.json(snapshot);
});

app.post('/api/agent/runs/:runId/gates/:gateId/reject', async (request, response) => {
  const { runId, gateId } = request.params;
  const snapshot = await agentRuntime.rejectGate(runId, gateId);
  response.json(snapshot);
});
```

- [ ] **Step 4: Add client API helpers**

```ts
export async function resumeAgentGate(runId: string, gateId: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/agent/runs/${runId}/gates/${gateId}/resume-waiting`, {
    method: 'POST',
  });
  return readJson<AgentRunSnapshot>(response);
}

export async function resolveAgentGate(runId: string, gateId: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/agent/runs/${runId}/gates/${gateId}/resolve`, {
    method: 'POST',
  });
  return readJson<AgentRunSnapshot>(response);
}
```

- [ ] **Step 5: Add resumed SSE continuation support**

```ts
export async function streamAgentRunContinuation({
  runId,
  signal,
  onEvent,
}: {
  runId: string;
  signal?: AbortSignal;
  onEvent?: (event: AgentStreamEvent) => void;
}) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/agent/runs/${runId}/stream`, {
    method: 'POST',
    signal,
  });
  return consumeAgentEventStream(response, onEvent);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec tsx --test server/http/agentRoutes.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/http/agentRoutes.ts server/http/agentRoutes.test.ts src/features/workbench/agentApi.ts
git commit -m "feat: add agent gate action endpoints"
```

## Task 5: Map HITL Events Into Frontend Run State

**Files:**
- Modify: `src/features/workbench/useAgentRun.ts`
- Modify: `src/features/workbench/useAgentRunModel.ts`
- Modify: `src/features/workbench/useAgentRunModel.test.ts`
- Create: `src/features/workbench/agentGateUiModel.ts`
- Create: `src/features/workbench/agentGateUiModel.test.ts`

- [ ] **Step 1: Write failing frontend state tests**

```ts
void test('maps human_gate_opened into a dedicated gate timeline item', () => {
  const items = applyAgentEventToTimeline(
    [],
    {
      type: 'human_gate_opened',
      runId: 'run-1',
      gate: {
        id: 'gate-1',
        runId: 'run-1',
        sessionId: 'session-1',
        kind: 'terminal_input',
        status: 'open',
        reason: '命令正在等待你在终端中继续输入。',
        openedAt: 1,
        deadlineAt: 2,
        payload: {
          toolCallId: 'call-1',
          toolName: 'session.run_command',
          command: 'sudo passwd root',
          timeoutMs: 300000,
        },
      },
      timestamp: 1,
    },
    () => 'item-1'
  );

  assert.equal(items[0]?.kind, 'human_gate');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/features/workbench/useAgentRunModel.test.ts src/features/workbench/agentGateUiModel.test.ts`
Expected: FAIL because `human_gate` timeline items and UI helpers do not exist yet.

- [ ] **Step 3: Add a dedicated timeline item kind for human gates**

```ts
export type AgentTimelineItem =
  | { id: string; kind: 'human_gate'; runId: string; gate: HumanGateRecord }
  | { id: string; kind: 'status'; text: string }
  | { id: string; kind: 'final'; text: string; steps: number };
```

- [ ] **Step 4: Map the new stream events**

```ts
if (event.type === 'human_gate_opened') {
  return {
    id: itemId,
    kind: 'human_gate',
    runId: event.runId,
    gate: event.gate,
  };
}

if (event.type === 'human_gate_expired') {
  return {
    id: itemId,
    kind: 'human_gate',
    runId: event.runId,
    gate: event.gate,
  };
}
```

- [ ] **Step 5: Persist suspended/open gate state inside useAgentRun**

```ts
const [activeGate, setActiveGate] = useState<HumanGateRecord | null>(null);
const [runState, setRunState] = useState<AgentRunState | null>(null);

if (event.type === 'run_state_changed') {
  setRunState(event.state);
}
if (event.type === 'human_gate_opened') {
  setActiveGate(event.gate);
}
if (event.type === 'human_gate_resolved' || event.type === 'human_gate_rejected') {
  setActiveGate(null);
}
```

- [ ] **Step 6: Add UI helper functions for gate labels and actions**

```ts
export function getHumanGatePrimaryActionLabel(gate: HumanGateRecord) {
  if (gate.kind === 'approval') {
    return '批准';
  }
  if (gate.kind === 'terminal_input' && gate.status === 'expired') {
    return '继续等待';
  }
  return null;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm exec tsx --test src/features/workbench/useAgentRunModel.test.ts src/features/workbench/agentGateUiModel.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/workbench/useAgentRun.ts src/features/workbench/useAgentRunModel.ts src/features/workbench/useAgentRunModel.test.ts src/features/workbench/agentGateUiModel.ts src/features/workbench/agentGateUiModel.test.ts
git commit -m "feat: map agent hitl gates into frontend state"
```

## Task 6: Render HITL UI And Enforce Session Locks

**Files:**
- Modify: `src/features/workbench/AiAssistantPanel.tsx`
- Modify: `src/features/workbench/SshTerminalPane.tsx`
- Modify: `src/features/workbench/useSshTerminalRuntime.ts`
- Modify: `src/features/workbench/types.ts`

- [ ] **Step 1: Write failing UI tests for gate cards and terminal banners**

```ts
// If the repo already keeps UI logic in pure models, prefer model tests here.
// Otherwise add focused render tests only for the gate card and banner branches.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/features/workbench/agentGateUiModel.test.ts`
Expected: FAIL until the UI branches consume the new helpers and states.

- [ ] **Step 3: Render a dedicated HITL card in the AI panel**

```tsx
if (item.kind === 'human_gate') {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="text-sm font-medium text-[var(--app-text-primary)]">{item.gate.reason}</div>
      <div className="mt-2 text-xs text-[var(--app-text-secondary)]">
        {item.gate.kind === 'terminal_input'
          ? '请在对应终端中完成交互输入。'
          : '该操作需要你的批准后才会继续执行。'}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add approval and resume-waiting button actions**

```tsx
{item.gate.kind === 'approval' ? (
  <div className="mt-3 flex gap-2">
    <button onClick={() => void resolveGate(item.gate.id)}>批准</button>
    <button onClick={() => void rejectGate(item.gate.id)}>拒绝</button>
  </div>
) : item.gate.status === 'expired' ? (
  <div className="mt-3">
    <button onClick={() => void resumeGate(item.gate.id)}>继续等待</button>
  </div>
) : null}
```

- [ ] **Step 5: Show a persistent terminal pane banner for agent-locked sessions**

```tsx
{agentSessionLock ? (
  <div className="absolute left-3 right-3 top-3 z-20 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
    {agentSessionLock.status === 'expired'
      ? '该终端上的 Agent 交互等待已暂停，可在 AI 面板中继续等待。'
      : '该终端正在被 Agent 用于交互命令，请在此完成输入。'}
  </div>
) : null}
```

- [ ] **Step 6: Disable conflicting terminal affordances while the session is locked**

```ts
const isAgentLocked = agentSessionLock !== null;

if (isAgentLocked) {
  setSuggestion(null);
}

if (isAgentLocked && resolution.commandToRecord) {
  // allow raw typing to continue the interactive command,
  // but disable local helper affordances that inject unrelated commands
}
```

- [ ] **Step 7: Run targeted tests to verify they pass**

Run: `pnpm exec tsx --test src/features/workbench/useAgentRunModel.test.ts src/features/workbench/agentGateUiModel.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/features/workbench/AiAssistantPanel.tsx src/features/workbench/SshTerminalPane.tsx src/features/workbench/useSshTerminalRuntime.ts src/features/workbench/types.ts
git commit -m "feat: add agent hitl gate ui and terminal locks"
```

## Task 7: Full Verification And Cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-04-03-agent-hitl-gates-design.md` only if implementation reveals a necessary spec correction

- [ ] **Step 1: Run focused server tests**

Run: `pnpm exec tsx --test server/agent/agentRunRegistry.test.ts server/agent/sessionRegistry.test.ts server/agent/agentRuntime.test.ts server/http/agentRoutes.test.ts`
Expected: PASS

- [ ] **Step 2: Run focused frontend tests**

Run: `pnpm exec tsx --test src/features/workbench/useAgentRunModel.test.ts src/features/workbench/agentGateUiModel.test.ts src/features/workbench/sshTerminalRuntimeModel.test.ts`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS with 0 errors

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Run desktop build**

Run: `pnpm desktop:build`
Expected: PASS

- [ ] **Step 6: Commit final integration adjustments**

```bash
git add server/agent server/http src/features/workbench docs/superpowers/specs
git commit -m "feat: implement agent hitl gates"
```

## Spec Coverage Check

- Unified in-memory HITL gate model: covered by Task 1 and Task 3.
- Explicit run lifecycle states: covered by Task 1 and Task 3.
- `terminal_input` and `approval` kinds: covered by Task 1, Task 3, and Task 4.
- Terminal input stays in terminal pane: covered by Task 6.
- Suspended terminal-input gates resume waiting without restart: covered by Task 2, Task 3, and Task 4.
- Approval resolve/reject from AI panel: covered by Task 4 and Task 6.
- Synchronized timeline and terminal-pane UI: covered by Task 5 and Task 6.
- Session lock semantics during terminal-input gates: covered by Task 6.
- Regression coverage: covered by Task 1, Task 2, Task 3, Task 4, Task 5, and Task 7.

## Placeholder Scan

- No `TBD`, `TODO`, or deferred implementation markers remain in tasks.
- Each task includes exact file paths, commands, and concrete code targets.
- Resume semantics and SSE continuation are explicitly covered rather than deferred.

## Type Consistency Check

- Run states consistently use `running`, `waiting_for_human`, `suspended`, `completed`, `failed`, `cancelled`.
- Gate kinds consistently use `terminal_input` and `approval`.
- Gate statuses consistently use `open`, `resolved`, `rejected`, `expired`.
- Resume endpoint naming consistently uses `resume-waiting`.
