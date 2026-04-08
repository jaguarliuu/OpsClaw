# HITL UI-Native Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productize OpsClaw HITL so `approval` and `parameter_confirmation` become frontend-native pending actions while runtime gates remain the safety truth and `terminal_input` keeps hard wait semantics.

**Architecture:** Extend runtime snapshots and gate records with explicit execution/blocking/presentation semantics, then build a frontend pending-gate queue consumed by both a global workbench entrypoint and the AI panel. Preserve existing `resolveGate`, `rejectGate`, and `resumeWaiting` APIs so continuation semantics remain stable while the UI interpretation changes.

**Tech Stack:** TypeScript, React 19, node:test, tsx, Express SSE

---

## File Map

### New Files

- `docs/superpowers/specs/2026-04-07-opsclaw-hitl-ui-native-design.md`
  - Approved product spec for this iteration.
- `src/features/workbench/agentPendingGateModel.ts`
  - Pure model for deriving queue items, labels, and sorting from gate snapshots/events.
- `src/features/workbench/agentPendingGateModel.test.ts`
  - Queue derivation, sorting, replacement, and removal coverage.
- `src/features/workbench/agentGatePresentationModel.ts`
  - Shared UI-facing interpretation helpers for run/gate semantics and labels.
- `src/features/workbench/agentGatePresentationModel.test.ts`
  - Coverage for `ui_gate` vs `terminal_wait` mapping.
- `src/features/workbench/PendingGateIndicator.tsx`
  - Workbench-level pending count button.
- `src/features/workbench/PendingGatePanel.tsx`
  - Global queue list + detail pane for pending UI-resolvable gates.
- `src/features/workbench/ApprovalActionCard.tsx`
  - Contextual approval card extracted from `AiAssistantPanel`.
- `src/features/workbench/ParameterInputCard.tsx`
  - Contextual parameter input card extracted from `AiAssistantPanel`.

### Existing Files To Modify

- `server/agent/humanGateTypes.ts`
  - Add execution and presentation semantics to runtime gate records.
- `server/agent/agentRunRegistry.ts`
  - Persist the new execution/blocking state and presentation mode in snapshots.
- `server/agent/agentRunRegistry.test.ts`
  - Verify UI-resolvable gates do not look like terminal waits and only one open UI gate per run exists.
- `server/agent/agentRuntime.ts`
  - Keep `approval` / `parameter_confirmation` on the same continuation path while emitting updated snapshots.
- `server/agent/agentRuntime.test.ts`
  - Verify unresolved UI gates still block mutation continuation and chain cleanly.
- `server/agent/agentTypes.ts`
  - Extend SSE payload state semantics.
- `server/http/agentRoutes.test.ts`
  - Verify resolve/reject responses return the richer snapshot shape.
- `src/features/workbench/types.agent.ts`
  - Mirror runtime execution/blocking/presentation fields on the frontend.
- `src/features/workbench/useAgentRunModel.ts`
  - Track pending gates separately from hard terminal waits.
- `src/features/workbench/useAgentRunModel.test.ts`
  - Cover new derived state and event behavior.
- `src/features/workbench/useAgentRun.ts`
  - Hold pending queue state and expose it to the workbench shell.
- `src/routes/WorkbenchPage.tsx`
  - Pass pending gate data into header/global panel and AI panel.
- `src/features/workbench/TerminalWorkspaceHeader.tsx`
  - Render the global pending gate indicator.
- `src/features/workbench/AiAssistantPanel.tsx`
  - Replace inline gate-specific rendering with extracted action cards and new product wording.
- `src/features/workbench/agentGateUiModel.ts`
  - Narrow to gate titles/descriptions that remain specific to timeline cards.
- `src/features/workbench/agentGateUiModel.test.ts`
  - Keep copy assertions aligned with the UI-native wording.

## Task 1: Add Runtime Execution And Presentation Semantics

**Files:**
- Modify: `server/agent/humanGateTypes.ts`
- Modify: `server/agent/agentRunRegistry.ts`
- Modify: `server/agent/agentTypes.ts`
- Modify: `server/agent/agentRunRegistry.test.ts`
- Modify: `server/agent/agentRuntime.test.ts`
- Modify: `src/features/workbench/types.agent.ts`

- [ ] **Step 1: Write the failing runtime snapshot test for UI-resolvable gates**

```ts
void test('approval gates mark the run as blocked_by_ui_gate instead of terminal waiting', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: '重启 nginx 服务',
  });

  registry.openGate({
    kind: 'approval',
    runId: 'run-1',
    sessionId: 'session-1',
    reason: '该操作需要用户审批后执行。',
    deadlineAt: Number.MAX_SAFE_INTEGER,
    payload: {
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      arguments: { command: 'systemctl restart nginx' },
      policy: { action: 'require_approval', matches: [] },
    },
  });

  const snapshot = registry.getRun('run-1');

  assert.equal(snapshot?.executionState, 'blocked_by_ui_gate');
  assert.equal(snapshot?.blockingMode, 'ui_gate');
  assert.equal(snapshot?.openGate?.presentationMode, 'inline_ui_action');
  assert.equal(snapshot?.state, 'waiting_for_human');
});
```

- [ ] **Step 2: Run the focused runtime registry tests to verify failure**

Run: `pnpm exec tsx --test server/agent/agentRunRegistry.test.ts`

Expected: FAIL because `executionState`, `blockingMode`, and `presentationMode` do not exist yet.

- [ ] **Step 3: Add the new runtime semantic types**

```ts
export type AgentRunExecutionState =
  | 'running'
  | 'blocked_by_ui_gate'
  | 'blocked_by_terminal'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRunBlockingMode = 'none' | 'ui_gate' | 'terminal_input';

export type HumanGatePresentationMode =
  | 'inline_ui_action'
  | 'terminal_wait';
```

Add them to:

- `server/agent/humanGateTypes.ts`
- `src/features/workbench/types.agent.ts`

and extend the record/snapshot shapes:

```ts
type HumanGateRecordBase = {
  id: string;
  runId: string;
  sessionId: string;
  status: HumanGateStatus;
  reason: string;
  openedAt: number;
  deadlineAt: number | null;
  presentationMode: HumanGatePresentationMode;
};

export type AgentRunRecord = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  executionState: AgentRunExecutionState;
  blockingMode: AgentRunBlockingMode;
  openGate: HumanGateRecord | null;
};
```

- [ ] **Step 4: Update the registry state transitions**

Use the following mapping in `server/agent/agentRunRegistry.ts`:

```ts
function getGatePresentationMode(kind: OpenHumanGateInput['kind']): HumanGatePresentationMode {
  return kind === 'terminal_input' ? 'terminal_wait' : 'inline_ui_action';
}

function getOpenGateExecutionState(kind: OpenHumanGateInput['kind']): AgentRunExecutionState {
  return kind === 'terminal_input' ? 'blocked_by_terminal' : 'blocked_by_ui_gate';
}

function getOpenGateBlockingMode(kind: OpenHumanGateInput['kind']): AgentRunBlockingMode {
  return kind === 'terminal_input' ? 'terminal_input' : 'ui_gate';
}
```

When opening gates:

```ts
run.state = 'waiting_for_human';
run.executionState = getOpenGateExecutionState(input.kind);
run.blockingMode = getOpenGateBlockingMode(input.kind);
```

When resolving or rejecting:

```ts
run.state = 'suspended';
run.executionState = 'suspended';
run.blockingMode = 'none';
```

When a run is running/completed/failed/cancelled:

```ts
run.executionState = 'running'; // or 'completed' / 'failed' / 'cancelled'
run.blockingMode = 'none';
```

- [ ] **Step 5: Add the runtime continuation regression for unresolved UI gates**

In `server/agent/agentRuntime.test.ts`, add:

```ts
test('open approval gate keeps mutation blocked until resolveGate is called', async () => {
  let executeCalls = 0;

  const runtime = new OpsAgentRuntime({
    // ... same harness pattern as existing approval tests
    sessions: {
      getSession() {
        return {
          sessionId: 'session-1',
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand() {
        executeCalls += 1;
        return {
          sessionId: 'session-1',
          command: 'systemctl restart nginx',
          exitCode: 0,
          output: '',
          startedAt: 1,
          completedAt: 2,
        };
      },
    } as never,
  });

  const runId = await openApprovalRun(runtime);
  assert.equal(runtime.getRunSnapshot(runId)?.executionState, 'blocked_by_ui_gate');
  assert.equal(executeCalls, 0);
});
```

- [ ] **Step 6: Run targeted tests to green**

Run: `pnpm exec tsx --test server/agent/agentRunRegistry.test.ts server/agent/agentRuntime.test.ts`

Expected: PASS with the new execution/blocking semantics covered.

- [ ] **Step 7: Commit**

```bash
git add server/agent/humanGateTypes.ts server/agent/agentRunRegistry.ts server/agent/agentTypes.ts server/agent/agentRunRegistry.test.ts server/agent/agentRuntime.test.ts src/features/workbench/types.agent.ts
git commit -m "feat: add ui-native hitl runtime semantics"
```

## Task 2: Add Frontend Pending Gate Models And Event Derivation

**Files:**
- Create: `src/features/workbench/agentPendingGateModel.ts`
- Create: `src/features/workbench/agentPendingGateModel.test.ts`
- Create: `src/features/workbench/agentGatePresentationModel.ts`
- Create: `src/features/workbench/agentGatePresentationModel.test.ts`
- Modify: `src/features/workbench/useAgentRunModel.ts`
- Modify: `src/features/workbench/useAgentRunModel.test.ts`
- Modify: `src/features/workbench/useAgentRun.ts`

- [ ] **Step 1: Write the failing pending-queue model tests**

```ts
void test('buildPendingUiGateItems only includes inline_ui_action gates and sorts approval first', () => {
  const items = buildPendingUiGateItems([
    createGate({
      kind: 'parameter_confirmation',
      openedAt: 20,
      presentationMode: 'inline_ui_action',
    }),
    createGate({
      kind: 'approval',
      openedAt: 10,
      presentationMode: 'inline_ui_action',
    }),
    createGate({
      kind: 'terminal_input',
      openedAt: 5,
      presentationMode: 'terminal_wait',
    }),
  ]);

  assert.deepEqual(items.map((item) => item.kind), ['approval', 'parameter_confirmation']);
});

void test('reducePendingUiGates replaces the previous open gate when the same run opens a new UI gate', () => {
  const first = reducePendingUiGates([], {
    type: 'human_gate_opened',
    runId: 'run-1',
    gate: createGate({
      id: 'gate-1',
      runId: 'run-1',
      kind: 'parameter_confirmation',
      presentationMode: 'inline_ui_action',
    }),
    timestamp: 1,
  });

  const second = reducePendingUiGates(first, {
    type: 'human_gate_opened',
    runId: 'run-1',
    gate: createGate({
      id: 'gate-2',
      runId: 'run-1',
      kind: 'approval',
      presentationMode: 'inline_ui_action',
    }),
    timestamp: 2,
  });

  assert.deepEqual(second.map((item) => item.gateId), ['gate-2']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec tsx --test src/features/workbench/agentPendingGateModel.test.ts src/features/workbench/agentGatePresentationModel.test.ts`

Expected: FAIL because the models do not exist yet.

- [ ] **Step 3: Add pure presentation and queue models**

`src/features/workbench/agentGatePresentationModel.ts`:

```ts
import type { AgentRunSnapshot, HumanGateRecord } from './types.agent';

export function isUiResolvableGate(gate: HumanGateRecord | null): boolean {
  return gate?.presentationMode === 'inline_ui_action';
}

export function isTerminalWaitGate(gate: HumanGateRecord | null): boolean {
  return gate?.presentationMode === 'terminal_wait';
}

export function getAgentRunDisplayState(snapshot: Pick<AgentRunSnapshot, 'executionState' | 'blockingMode' | 'state'>) {
  if (snapshot.blockingMode === 'ui_gate') {
    return 'awaiting_user_action';
  }
  if (snapshot.blockingMode === 'terminal_input') {
    return 'waiting_terminal';
  }
  return snapshot.state;
}
```

`src/features/workbench/agentPendingGateModel.ts`:

```ts
import type { AgentStreamEvent, HumanGateRecord } from './types.agent';

export type PendingUiGateItem = {
  gateId: string;
  runId: string;
  sessionId: string;
  kind: 'approval' | 'parameter_confirmation';
  title: string;
  summary: string;
  openedAt: number;
};

export function toPendingUiGateItem(gate: HumanGateRecord): PendingUiGateItem | null {
  if (gate.presentationMode !== 'inline_ui_action') {
    return null;
  }
  if (gate.kind !== 'approval' && gate.kind !== 'parameter_confirmation') {
    return null;
  }
  return {
    gateId: gate.id,
    runId: gate.runId,
    sessionId: gate.sessionId,
    kind: gate.kind,
    title: gate.kind === 'approval' ? '待批准' : '待补全',
    summary: gate.reason,
    openedAt: gate.openedAt,
  };
}
```

Also implement `reducePendingUiGates()` to:

- add `human_gate_opened` inline-ui gates
- remove `human_gate_resolved` / `human_gate_rejected`
- replace previous open item for the same `runId`
- keep `approval` ahead of `parameter_confirmation`

- [ ] **Step 4: Extend `useAgentRunModel` and `useAgentRun`**

In `src/features/workbench/useAgentRunModel.ts`:

```ts
export type AgentEventState = {
  runId: string | null;
  runState: AgentRunState | null;
  executionState: AgentRunExecutionState | null;
  blockingMode: AgentRunBlockingMode | null;
  activeGate: HumanGateRecord | null;
  pendingUiGates: PendingUiGateItem[];
  error: string | null;
};
```

Update reducers so:

- `run_state_changed` updates the new run execution fields
- `human_gate_*` drives both `activeGate` and `pendingUiGates`

In `src/features/workbench/useAgentRun.ts`:

- hold `pendingUiGates` in hook state
- expose it from the hook result
- keep `pendingContinuationRunId` only for terminal wait flows

- [ ] **Step 5: Run model tests to green**

Run: `pnpm exec tsx --test src/features/workbench/agentPendingGateModel.test.ts src/features/workbench/agentGatePresentationModel.test.ts src/features/workbench/useAgentRunModel.test.ts`

Expected: PASS with queue derivation and display-state mapping covered.

- [ ] **Step 6: Commit**

```bash
git add src/features/workbench/agentPendingGateModel.ts src/features/workbench/agentPendingGateModel.test.ts src/features/workbench/agentGatePresentationModel.ts src/features/workbench/agentGatePresentationModel.test.ts src/features/workbench/useAgentRunModel.ts src/features/workbench/useAgentRunModel.test.ts src/features/workbench/useAgentRun.ts
git commit -m "feat: add pending hitl queue models"
```

## Task 3: Add The Global Pending Gate Entry And Panel

**Files:**
- Create: `src/features/workbench/PendingGateIndicator.tsx`
- Create: `src/features/workbench/PendingGatePanel.tsx`
- Modify: `src/features/workbench/TerminalWorkspaceHeader.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`
- Modify: `src/features/workbench/workbenchShellModel.ts`
- Modify: `src/features/workbench/workbenchShellModel.test.ts`

- [ ] **Step 1: Write the failing shell model test**

```ts
void test('pending gate indicator is visible when at least one pending ui gate exists', () => {
  assert.equal(getPendingGateIndicatorVisible(0), false);
  assert.equal(getPendingGateIndicatorVisible(1), true);
});

void test('togglePanelOpenState toggles the pending gate panel independently', () => {
  assert.equal(toggleBooleanState(false), true);
  assert.equal(toggleBooleanState(true), false);
});
```

- [ ] **Step 2: Run the shell model test to verify it fails**

Run: `pnpm exec tsx --test src/features/workbench/workbenchShellModel.test.ts`

Expected: FAIL because the pending-gate helpers do not exist yet.

- [ ] **Step 3: Add shell helpers and the indicator component**

In `src/features/workbench/workbenchShellModel.ts` add:

```ts
export function getPendingGateIndicatorVisible(count: number) {
  return count > 0;
}

export function formatPendingGateIndicatorLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}
```

Create `src/features/workbench/PendingGateIndicator.tsx`:

```tsx
type PendingGateIndicatorProps = {
  count: number;
  onClick: () => void;
};

export function PendingGateIndicator({ count, onClick }: PendingGateIndicatorProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-200"
    >
      <span>待处理</span>
      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-black">
        {count}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Add the global pending panel**

Create `src/features/workbench/PendingGatePanel.tsx` with:

- left list of queue items
- right detail pane
- selection state owned by the panel
- callbacks:
  - `onSelectRun(runId)`
  - `onResolve(runId, gateId, input?)`
  - `onReject(runId, gateId)`

Use a minimal list-first layout:

```tsx
{items.map((item) => (
  <button
    key={item.gateId}
    type="button"
    onClick={() => setSelectedGateId(item.gateId)}
  >
    <div>{item.title}</div>
    <div>{item.summary}</div>
  </button>
))}
```

- [ ] **Step 5: Wire the header and workbench page**

In `src/features/workbench/TerminalWorkspaceHeader.tsx`:

- add prop `pendingUiGateCount: number`
- add prop `onOpenPendingGates: () => void`
- render `<PendingGateIndicator />` next to the AI button group

In `src/routes/WorkbenchPage.tsx`:

- add local `isPendingGatePanelOpen`
- pass `agentRun.pendingUiGates.length` into the header
- render `<PendingGatePanel />` alongside other overlays/panels

- [ ] **Step 6: Run targeted tests**

Run: `pnpm exec tsx --test src/features/workbench/workbenchShellModel.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/workbench/PendingGateIndicator.tsx src/features/workbench/PendingGatePanel.tsx src/features/workbench/TerminalWorkspaceHeader.tsx src/routes/WorkbenchPage.tsx src/features/workbench/workbenchShellModel.ts src/features/workbench/workbenchShellModel.test.ts
git commit -m "feat: add global pending hitl entry"
```

## Task 4: Extract Product-Facing Action Cards Into The AI Panel

**Files:**
- Create: `src/features/workbench/ApprovalActionCard.tsx`
- Create: `src/features/workbench/ParameterInputCard.tsx`
- Modify: `src/features/workbench/AiAssistantPanel.tsx`
- Modify: `src/features/workbench/agentGateUiModel.ts`
- Modify: `src/features/workbench/agentGateUiModel.test.ts`
- Modify: `src/features/workbench/agentParameterGateModel.ts`
- Modify: `src/features/workbench/agentParameterGateModel.test.ts`

- [ ] **Step 1: Write the failing copy/model tests**

```ts
void test('approval copy uses product wording instead of waiting-for-human wording', () => {
  assert.equal(getHumanGateTitle(createApprovalGate()), '这一步需要你的批准');
  assert.equal(getHumanGatePrimaryActionLabel(createApprovalGate()), '批准并继续');
});

void test('parameter gate model marks edited explicit values as user_confirmed', () => {
  const next = updateParameterGateFormValue(
    buildParameterGateFormState({
      fields: [
        {
          name: 'username',
          label: '用户名',
          value: 'ops-admin',
          required: true,
          source: 'user_explicit',
        },
      ],
    }),
    'username',
    'ops-root'
  );

  assert.equal(next.fields[0]?.source, 'user_confirmed');
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `pnpm exec tsx --test src/features/workbench/agentGateUiModel.test.ts src/features/workbench/agentParameterGateModel.test.ts`

Expected: FAIL because the copy and source-upgrade behavior are not implemented yet.

- [ ] **Step 3: Extract `ApprovalActionCard` and `ParameterInputCard`**

Create `src/features/workbench/ApprovalActionCard.tsx`:

```tsx
type ApprovalActionCardProps = {
  gate: ApprovalGateRecord;
  isBusy: boolean;
  onResolve: (runId: string, gateId: string) => Promise<void>;
  onReject: (runId: string, gateId: string) => Promise<void>;
};
```

Create `src/features/workbench/ParameterInputCard.tsx`:

```tsx
type ParameterInputCardProps = {
  gate: ParameterConfirmationGateRecord;
  isBusy: boolean;
  onResolve: (
    runId: string,
    gateId: string,
    input: { fields: Record<string, string> }
  ) => Promise<void>;
  onReject: (runId: string, gateId: string) => Promise<void>;
};
```

The parameter card should:

- render provenance labels
- show required markers
- validate before submit
- call `buildParameterGateResolveInput()`

- [ ] **Step 4: Upgrade the gate models**

In `src/features/workbench/agentGateUiModel.ts`, use product wording:

```ts
if (gate.kind === 'approval') {
  return '这一步需要你的批准';
}

if (gate.kind === 'parameter_confirmation') {
  return '需要你确认几个参数';
}
```

And:

```ts
if (gate.kind === 'approval') {
  return '批准并继续';
}

if (gate.kind === 'parameter_confirmation') {
  return '确认并继续';
}
```

In `src/features/workbench/agentParameterGateModel.ts`, when a user edits a field:

```ts
fields: state.fields.map((field) =>
  field.name === name
    ? {
        ...field,
        source: 'user_confirmed',
      }
    : field
),
```

- [ ] **Step 5: Refactor `AiAssistantPanel.tsx` to consume the extracted cards**

Replace the current inline gate branches with:

```tsx
if (item.kind === 'human_gate' && item.gate.kind === 'approval') {
  return (
    <ApprovalActionCard
      gate={item.gate}
      isBusy={isBusy}
      onResolve={onResolve}
      onReject={onReject}
    />
  );
}

if (item.kind === 'human_gate' && item.gate.kind === 'parameter_confirmation') {
  return (
    <ParameterInputCard
      gate={item.gate}
      isBusy={isBusy}
      onResolve={onResolve}
      onReject={onReject}
    />
  );
}
```

Leave `terminal_input` inside the existing wait-style card path.

- [ ] **Step 6: Run the focused tests**

Run: `pnpm exec tsx --test src/features/workbench/agentGateUiModel.test.ts src/features/workbench/agentParameterGateModel.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/workbench/ApprovalActionCard.tsx src/features/workbench/ParameterInputCard.tsx src/features/workbench/AiAssistantPanel.tsx src/features/workbench/agentGateUiModel.ts src/features/workbench/agentGateUiModel.test.ts src/features/workbench/agentParameterGateModel.ts src/features/workbench/agentParameterGateModel.test.ts
git commit -m "feat: add productized hitl action cards"
```

## Task 5: Verify End-To-End Semantics And Compatibility

**Files:**
- Modify: `server/http/agentRoutes.test.ts`
- Modify: `server/agent/agentRuntime.test.ts`
- Modify: `src/features/workbench/useAgentRunModel.test.ts`
- Modify: `src/features/workbench/agentPendingGateModel.test.ts`

- [x] **Step 1: Add the failing compatibility regression tests**

```ts
void test('terminal_input gates still map to waiting_terminal and never enter the global pending queue', () => {
  const state = reduceAgentEventState(initialState, {
    type: 'human_gate_opened',
    runId: 'run-1',
    gate: createTerminalInputGate(),
    timestamp: 1,
  });

  assert.equal(state.blockingMode, 'terminal_input');
  assert.deepEqual(state.pendingUiGates, []);
});

test('resolveGate for approval returns a snapshot with blockingMode none', async () => {
  // extend the existing route test snapshot shape and assert the richer fields
});
```

- [x] **Step 2: Run the targeted suite to verify failures**

Run: `pnpm exec tsx --test server/http/agentRoutes.test.ts server/agent/agentRuntime.test.ts src/features/workbench/useAgentRunModel.test.ts src/features/workbench/agentPendingGateModel.test.ts`

Expected: FAIL until the richer semantics and interaction-only cleanup are wired consistently.

- [x] **Step 3: Implement the missing compatibility behavior**

Ensure all of these hold:

- `terminal_input` never becomes a pending UI gate
- resolve/reject snapshots clear `blockingMode`
- chained `parameter_confirmation -> approval` replaces the pending item for the same run
- unresolved `approval` still blocks the mutation continuation in runtime
- legacy `human_gate_*`, `approval_required`, and gate bridge helpers no longer leak through runtime/frontend protocol surfaces

- [x] **Step 4: Run the full feature verification suite**

Run:

```bash
pnpm exec tsx --test \
  server/agent/agentRunRegistry.test.ts \
  server/agent/agentRuntime.test.ts \
  server/http/agentRoutes.test.ts \
  server/httpRouteModules.test.ts \
  server/agent/unifiedInteractionCleanup.test.ts \
  src/features/workbench/agentInteractionModel.test.ts \
  src/features/workbench/agentPendingGateModel.test.ts \
  src/features/workbench/agentGatePresentationModel.test.ts \
  src/features/workbench/agentSessionModel.test.ts \
  src/features/workbench/useAgentRunModel.test.ts \
  src/features/workbench/workbenchShellModel.test.ts
```

Expected: PASS

- [x] **Step 5: Run typechecks and lint**

Run:

```bash
pnpm typecheck
pnpm exec eslint \
  server/agent/interactionPayloadTypes.ts \
  server/agent/agentRunRegistry.ts \
  server/agent/agentTypes.ts \
  server/http/agentRoutes.test.ts \
  src/features/workbench/types.agent.ts \
  src/features/workbench/useAgentRun.ts \
  src/features/workbench/useAgentRunModel.ts \
  src/features/workbench/agentPendingGateModel.ts \
  src/features/workbench/agentGatePresentationModel.ts \
  src/features/workbench/agentInteractionModel.ts \
  src/features/workbench/TerminalWorkspaceHeader.tsx \
  src/routes/WorkbenchPage.tsx \
  src/features/workbench/AiAssistantPanel.tsx
```

Expected:

- `pnpm typecheck` PASS
- `eslint` PASS

- [ ] **Step 6: Commit**

```bash
git add server/http/agentRoutes.test.ts server/agent/agentRuntime.test.ts src/features/workbench/useAgentRunModel.test.ts src/features/workbench/agentPendingGateModel.test.ts
git commit -m "test: verify ui-native hitl compatibility"
```

## Self-Review

### Spec Coverage

Covered by this plan:

- runtime gate remains source of truth
- `approval` / `parameter_confirmation` become frontend-native pending actions
- `terminal_input` keeps hard wait semantics
- global pending entrypoint and queue
- AI panel contextual action cards
- multiple runs can hold pending UI actions
- one open UI-resolvable gate per run
- unresolved UI gates still block mutation continuation

Deferred intentionally:

- batch approval
- full audit center
- cross-device pending sync
- unrestricted post-gate tool progression

### Placeholder Scan

No `TODO`, `TBD`, or "implement later" placeholders remain. Every task names exact files, tests, commands, and code skeletons.

### Type Consistency

This plan consistently uses:

- `AgentRunExecutionState`
- `AgentRunBlockingMode`
- `HumanGatePresentationMode`
- `PendingUiGateItem`
- `blocked_by_ui_gate`
- `blocked_by_terminal`
- `inline_ui_action`
- `terminal_wait`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-07-hitl-ui-native-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
