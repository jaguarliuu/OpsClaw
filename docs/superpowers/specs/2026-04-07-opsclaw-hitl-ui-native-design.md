# OpsClaw HITL UI-Native Design

## Goal

Upgrade OpsClaw's HITL experience so `approval` and `parameter_confirmation` feel like native product interactions instead of visible runtime pauses, while preserving the runtime gate model as the single source of truth for safety.

The target outcome is:

- `approval` and `parameter_confirmation` appear as frontend-native action cards
- users can discover pending actions from both the AI panel and a global pending entrypoint
- the run no longer feels "stuck" for UI-resolvable gates
- runtime safety boundaries remain unchanged
- `terminal_input` keeps its current hard waiting semantics

## Problem

The current HITL implementation is functionally correct but not productized enough.

Current behavior:

- runtime opens a `human_gate`
- frontend renders a card inside the AI panel
- the run is perceived as waiting for human input

This creates three product issues:

- `approval` and `parameter_confirmation` feel like engine pauses instead of structured user actions
- if the AI panel is collapsed, pending work is easy to miss
- the UI still presents all gates with an overly infra-oriented mental model

For OpsClaw, this is not the right experience. Users should feel like they are completing a task card, approving a step, or filling a short form, not resuming a stalled thread.

## Product Principles

### 1. Runtime Gates Remain The Safety Truth

The frontend must not replace runtime gates with local-only state.

`approval`, `parameter_confirmation`, and `terminal_input` remain runtime-owned gates so the system keeps:

- consistent safety boundaries
- resumability
- auditability
- multi-view consistency

### 2. UI-Resolvable Gates Should Feel Native

If a gate can be resolved fully through structured frontend input, the user should not experience it as a hard pause.

This applies to:

- `parameter_confirmation`
- `approval`

These become frontend-native HITL actions.

### 3. Terminal-Native Interaction Keeps Hard Pause Semantics

If the user must return to the SSH session or TTY itself, the system should still use explicit wait/resume behavior.

This applies to:

- `terminal_input`

### 4. UI Non-Blocking Does Not Mean Execution Non-Blocking

Even when a run no longer feels visually paused, the runtime must still stop at the gate boundary and must not continue executing the protected mutation path until the gate is resolved.

## Scope

### In Scope

- redefine `approval` and `parameter_confirmation` as frontend-native HITL experiences
- add a global pending action entrypoint and queue
- add clearer runtime execution/blocking semantics for frontend interpretation
- preserve current `resolveGate`, `rejectGate`, and `resumeWaiting` APIs
- keep `terminal_input` as a true waiting interaction

### Out Of Scope

- replacing runtime gates with frontend-only workflow state
- building a full audit center in this iteration
- batch approval
- cross-device pending action sync
- allowing the agent to continue unrestricted tool progression after opening a UI-resolvable gate

## Approaches Considered

### Approach A: Keep Current Pause Semantics, Only Polish The Cards

Pros:

- lowest implementation cost
- minimal runtime change

Cons:

- product semantics remain wrong
- users still perceive the run as stuck
- does not solve discoverability outside the AI panel

Decision: reject.

### Approach B: Runtime Gates Stay, UI Semantics Become Native

Pros:

- preserves safety model
- improves product experience substantially
- keeps compatibility with existing HITL APIs
- creates a reusable base for future risky-action approval flows

Cons:

- requires new state semantics and frontend queueing
- requires careful run/gate interpretation changes

Decision: adopt.

### Approach C: Move HITL Fully Into Frontend Workflow State

Pros:

- superficially simple product interaction

Cons:

- weakens safety boundaries
- fragments source of truth
- makes resumability and audit harder

Decision: reject.

## Recommended Design

OpsClaw should keep runtime gates exactly where safety requires them, but should reinterpret `approval` and `parameter_confirmation` at the product layer as pending user actions instead of hard runtime waits.

The design has three parts:

1. classify gate presentation mode
2. expose a global pending action queue
3. keep runtime blocked at the gate boundary while allowing the frontend to feel continuous

## Core Product Semantics

### Gate Types

#### `parameter_confirmation`

Meaning:

- the user must confirm, edit, or complete structured parameters

Frontend presentation:

- input card
- form card
- selection card

Product wording:

- `待你补全`

#### `approval`

Meaning:

- the user must authorize a high-risk action before it executes

Frontend presentation:

- approval card
- risk confirmation card

Product wording:

- `待你批准`

#### `terminal_input`

Meaning:

- the user must complete interaction in the terminal/session itself

Frontend presentation:

- waiting state
- recoverable terminal interaction card

Product wording:

- `等待终端交互`

## State Model

### Execution State

The runtime should expose a more accurate execution-facing state model for the frontend:

```ts
type AgentRunExecutionState =
  | 'running'
  | 'blocked_by_ui_gate'
  | 'blocked_by_terminal'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

Interpretation:

- `approval` / `parameter_confirmation` -> `blocked_by_ui_gate`
- `terminal_input` -> `blocked_by_terminal`

### Blocking Mode

The snapshot should also expose a simpler interpretation layer:

```ts
type AgentRunBlockingMode = 'none' | 'ui_gate' | 'terminal_input';
```

### Gate Presentation Mode

Each gate should declare how the frontend should present it:

```ts
type HumanGatePresentationMode =
  | 'inline_ui_action'
  | 'terminal_wait';
```

Recommended mapping:

- `approval` -> `inline_ui_action`
- `parameter_confirmation` -> `inline_ui_action`
- `terminal_input` -> `terminal_wait`

### Gate Status

Status remains:

```ts
type HumanGateStatus = 'open' | 'resolved' | 'rejected' | 'expired';
```

But product semantics change:

- `approval` and `parameter_confirmation` should default to no timeout
- `expired` remains primarily relevant to `terminal_input`

### Queue Constraints

Rules:

- multiple runs may have pending UI-resolvable gates at the same time
- a single run may have at most one open UI-resolvable gate at a time
- chained gates are allowed, but sequentially, not concurrently

## Event Model And Flow

### Event Compatibility Strategy

First iteration should reuse the current SSE events:

- `human_gate_opened`
- `human_gate_resolved`
- `human_gate_rejected`
- `human_gate_expired`
- `run_state_changed`

The protocol does not need a full rewrite yet. The main change is how the frontend interprets those events.

### Frontend Reaction To `human_gate_opened`

When a gate opens:

- if `presentationMode === 'inline_ui_action'`
  - add it to the global pending queue
  - render an action card in the AI panel timeline
  - mark the run as `待你处理`
- if `presentationMode === 'terminal_wait'`
  - keep the current waiting/recoverable terminal behavior

### Resolve Flow

For `parameter_confirmation`:

1. user edits structured fields in UI
2. frontend validates required input
3. frontend calls `resolveGate(runId, gateId, { fields })`
4. runtime resolves the gate and continues
5. frontend removes the pending item
6. if a chained gate opens, it becomes the next pending item immediately

For `approval`:

1. user approves or rejects in UI
2. frontend calls `resolveGate` or `rejectGate`
3. pending queue and timeline update immediately

### Timeline Semantics

The timeline still shows gate events, but with product-facing language:

- `parameter_confirmation` -> `需要你确认几个参数`
- `approval` -> `这一步需要你的批准`
- `terminal_input` -> `等待你在终端中完成输入`

## Frontend Information Architecture

### Layer 1: Global Pending Entry

A global pending indicator should live in the workbench shell and show:

- total count of pending UI-resolvable gates
- a stable place for users to discover pending actions without opening the AI panel

### Layer 2: Pending Action Panel

This panel should list all open `approval` and `parameter_confirmation` gates across runs.

Recommended layout:

- left list of pending items
- right detail pane for the selected item

Each list item should show:

- gate type
- task summary
- session label
- one-line reason
- risk emphasis when applicable

### Layer 3: AI Panel Context Card

The AI panel remains the contextual place to understand and resolve the action inside the run timeline.

The AI panel should contain action-specific cards:

- `ApprovalActionCard`
- `ParameterInputCard`

Both should share a common shell:

- title
- session context
- summary
- action footer

## Interaction Rules

### Opening Behavior

When a UI-resolvable gate opens:

- insert the card into the AI panel timeline
- increment the global pending count
- optionally show a light toast
- do not force-open the AI panel

### Focus Behavior

- if the user is already viewing the corresponding run, scroll to the new card
- if not, rely on the global pending entrypoint instead of forcefully interrupting the user

### Pending Queue Sorting

Recommended order:

1. `approval` before `parameter_confirmation`
2. older items before newer items
3. a new gate for the same run replaces the previous pending UI gate rather than creating parallel noise

### Parameter Input Rules

- required fields must be completed before submit
- default values may be edited
- each field should show its provenance
- if the user edits a field, it becomes user-confirmed input

### Approval Rules

Approval cards should show:

- what action will execute
- why it is risky
- what approval means
- what rejection means

Button wording should be explicit:

- `批准并继续`
- `拒绝本次操作`

### Reject Behavior

Rejecting a UI-resolvable gate should:

- remove it from the pending queue
- append a clear rejected result to the timeline
- leave the run in a comprehensible non-success state without pretending the risky step executed

### Chained Gate Behavior

If `parameter_confirmation` leads into `approval`:

- the parameter card should move into a completed state
- the approval card should replace or immediately follow it
- the UI should read as step progression, not as two unrelated interruptions

## Runtime Execution Boundary

### Core Rule

The runtime must not cross an open UI-resolvable gate boundary.

This rule should be explicit:

- before `resolveGate` or `rejectGate`, no protected mutation path may continue
- UI continuity must not be confused with execution continuity

### Soft Block vs Hard Block

Runtime should distinguish:

- `soft_block`
  - `approval`
  - `parameter_confirmation`
- `hard_block`
  - `terminal_input`

In the first implementation iteration:

- `soft_block` should still stop real tool progression
- the frontend simply should not present it as a hard pause

This keeps risk low and preserves current continuation behavior.

### Continuation Compatibility

Existing APIs remain:

- `resolveGate(runId, gateId, { fields? })`
- `rejectGate(runId, gateId)`
- `resumeWaiting(runId, gateId)`

Recommended behavior:

- `approval` and `parameter_confirmation` continue to use resolve/reject
- `terminal_input` continues to use resume-waiting

## Data Model Changes

### Runtime Snapshot

```ts
type AgentRunSnapshot = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  executionState?: AgentRunExecutionState;
  blockingMode?: AgentRunBlockingMode;
  openGate: HumanGateRecord | null;
};
```

### Gate Base Shape

```ts
type HumanGateRecordBase = {
  id: string;
  runId: string;
  sessionId: string;
  status: HumanGateStatus;
  reason: string;
  openedAt: number;
  deadlineAt: number | null;
  presentationMode?: HumanGatePresentationMode;
};
```

### Frontend Pending Queue Model

```ts
type PendingUiGateItem = {
  gateId: string;
  runId: string;
  sessionId: string;
  kind: 'approval' | 'parameter_confirmation';
  title: string;
  summary: string;
  openedAt: number;
  sessionLabel?: string;
  taskPreview: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
};
```

## Implementation Scope

### In This Iteration

- add runtime-facing state semantics for UI-resolvable vs terminal-wait gates
- add frontend global pending queue and entrypoint
- split AI panel gate rendering into product-facing action cards
- keep runtime gate continuation behavior intact

### Not In This Iteration

- batch approval
- full audit center
- cross-device pending state sync
- unrestricted post-gate model/tool continuation

## Migration Plan

### Phase A: Semantics

- add `executionState`
- add `blockingMode`
- add `presentationMode`
- update frontend interpretation logic

### Phase B: Global Pending Queue

- add pending queue store/model
- add pending badge
- add pending panel

### Phase C: AI Panel Componentization

- extract action card shell
- extract approval card
- extract parameter input card

### Phase D: UX Polish

- rejection states
- chained gate transitions
- toasts
- copy unification

## Risks

### 1. UI Continuity Could Accidentally Become Execution Continuity

Mitigation:

- keep runtime gate as the only execution boundary
- add explicit tests ensuring mutation execution cannot continue before resolve/reject

### 2. AI Panel Could Continue Growing Into A Large Conditional File

Mitigation:

- componentize gate cards
- move queue/gate presentation logic into dedicated models

### 3. Global Queue And AI Panel Could Drift Out Of Sync

Mitigation:

- both consume the same pending gate store
- do not let each view maintain independent truth

### 4. Chained Gates Could Feel Confusing

Mitigation:

- enforce one open UI gate per run
- show explicit transition copy between sequential gates

## Acceptance Criteria

### Product Acceptance

- `parameter_confirmation` appears as a native parameter form task, not a hard pause
- `approval` appears as a native approval task, not a runtime-stalled state
- users can discover pending actions without opening the AI panel
- multiple runs can hold pending UI actions simultaneously
- resolving or rejecting an action updates both the global queue and timeline immediately

### System Acceptance

- runtime does not execute protected mutation continuation before `approval` or `parameter_confirmation` resolves
- `terminal_input` behavior remains unchanged
- chained gates still work correctly
- old snapshots remain readable by the new frontend

### Test Acceptance

Required coverage should include:

- gate presentation mode mapping
- pending queue aggregation across multiple runs
- resolve/reject queue removal
- chained gate replacement behavior
- unresolved UI gate prevents mutation continuation
- terminal input regression coverage

## Decision Summary

OpsClaw should implement HITL scheme B:

- keep runtime gates
- productize `approval` and `parameter_confirmation` as frontend-native pending actions
- keep `terminal_input` as a true wait/resume interaction
- preserve runtime safety boundaries while removing the feeling that the agent has simply stalled
