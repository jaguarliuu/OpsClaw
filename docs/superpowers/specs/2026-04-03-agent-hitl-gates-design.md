# Agent HITL Gates Design

## Goal

Introduce a unified human-in-the-loop (HITL) gate model for agent runs so the agent can pause, wait for human intervention, and then continue naturally without losing execution context.

The first two HITL scenarios are:

- `terminal_input`: a shell command has already been sent to a session and is waiting for the user to complete an interactive prompt in the terminal
- `approval`: the agent wants to execute a high-risk action and must wait for explicit user approval before the tool call proceeds

This design intentionally makes HITL a first-class runtime concept instead of treating it as an error path. The same framework should later support more gate kinds without replacing the core state machine.

## Current State

The current system has two relevant behaviors:

- interactive shell commands can remain pending inside `SessionRegistry`, and user terminal input can extend the wait window until the command finally completes
- high-risk commands can emit `approval_required`, but the current implementation immediately converts that into a failed tool result because there is no approval workflow

Relevant files:

- `server/agent/agentRuntime.ts`
- `server/agent/toolExecutor.ts`
- `server/agent/sessionRegistry.ts`
- `server/http/agentRoutes.ts`
- `server/terminalGateway.ts`
- `src/features/workbench/AiAssistantPanel.tsx`
- `src/features/workbench/useAgentRun.ts`
- `src/features/workbench/useAgentRunModel.ts`
- `src/features/workbench/SshTerminalPane.tsx`

## Problem

The current architecture treats “waiting for the human” as an implementation detail instead of a runtime state.

That causes several product and correctness gaps:

- the agent timeline has no explicit `waiting_for_human` state
- the terminal can visually appear normal even when the session is effectively locked by the agent
- interactive shell waiting works only as an internal promise extension and cannot be resumed after timeout
- approval gating is surfaced as an error instead of a resumable pause
- there is no unified persistence model for “the run is blocked on a human action”
- future HITL cases would force additional bespoke flows

The practical user-facing result is confusing: the agent appears stuck, but the system has no formal notion of a suspended run or a resumable human gate.

## Scope

### In Scope

- add a unified in-memory HITL gate model for agent runs
- add run lifecycle states that explicitly represent human waiting and suspension
- support `terminal_input` and `approval` as the first gate kinds
- keep interactive terminal input inside the terminal pane, not the AI panel
- allow suspended `terminal_input` gates to resume waiting without restarting the run
- allow `approval` gates to resolve or reject from the AI panel
- show synchronized HITL state in both the agent timeline and terminal pane
- enforce session locking while a `terminal_input` gate is active
- add regression coverage for runtime, gateway, and frontend state mapping

### Out of Scope

- persistent storage of runs or gates across server restarts
- multi-gate parallelism inside a single run
- arbitrary text response collection inside the AI panel
- replaying or reconstructing a lost terminal command after process restart
- organization-level approval policy workflows

## Approaches Considered

### Approach A: Keep Separate Flows For Interactive Input And Approval

Pros:

- lower short-term implementation cost
- minimal changes to the current runtime abstractions

Cons:

- duplicates suspension and recovery logic
- guarantees UI and lifecycle drift
- makes future HITL scenarios more expensive

Decision: reject.

### Approach B: Unified In-Memory HITL Gates By Kind

Pros:

- one runtime model for `terminal_input` and `approval`
- explicit run and gate lifecycle
- clean path for later gate kinds
- preserves current session command execution path where it already works

Cons:

- broader initial refactor than a local patch
- requires coordinated changes across server, API, and frontend timeline state

Decision: adopt.

### Approach C: Persistent Workflow Engine

Pros:

- strongest long-term recovery story
- survives page refreshes and process restarts

Cons:

- much larger scope than the current iteration
- would force database and orchestration design decisions prematurely

Decision: defer.

## Product Rules

### Rule 1: Terminal Input Uses The Terminal, Not The AI Panel

When a command is waiting for terminal interaction, the user must complete that interaction inside the bound SSH terminal pane.

The AI panel should explain what is happening, but it should not become a second shell input surface.

### Rule 2: One Session, One Active Agent Terminal Gate

If a session is bound to an open `terminal_input` gate:

- no second agent command may run in that session
- no second agent run may bind to that session
- helper entry points that inject commands into that session should be disabled
- user typing is treated only as continuation of the already-running interactive command

This prevents transcript contamination and keeps ownership unambiguous.

### Rule 3: Timeouts Suspend, Not Fail

If a human gate expires:

- the gate becomes `expired`
- the run becomes `suspended`
- the UI must offer an explicit recovery action

The run should not be converted into a terminal failure unless the user explicitly rejects the gate or the underlying command actually fails.

## Recommended Design

The system should add a unified HITL layer centered on two concepts:

- `AgentRunState`
- `HumanGate`

### Agent Run State

Each run gains explicit lifecycle state:

- `running`
- `waiting_for_human`
- `suspended`
- `completed`
- `failed`
- `cancelled`

Interpretation:

- `waiting_for_human` means the runtime is still live and has an open gate
- `suspended` means the runtime is no longer actively waiting, but it can be resumed through a supported gate action

### Human Gate

Each gate has:

- `id`
- `runId`
- `sessionId`
- `kind`
- `status`
- `reason`
- `openedAt`
- `deadlineAt`
- `payload`

Kinds:

- `terminal_input`
- `approval`

Statuses:

- `open`
- `resolved`
- `rejected`
- `expired`

The payload is kind-specific.

`terminal_input` payload should contain enough UI context to explain the wait:

- `toolCallId`
- `toolName`
- `command`
- `sessionLabel` when available
- `timeoutMs`

`approval` payload should contain:

- `toolCallId`
- `toolName`
- `arguments`
- `policy`

## Runtime Architecture

### 1. SessionRegistry Becomes HITL-Aware

`SessionRegistry` already knows when a command has entered an interactive waiting state. Today that knowledge exists only as:

- `humanInputDetectedAt`
- timeout extension behavior

That needs to become an explicit pending execution state.

Recommended pending execution state:

- `running`
- `awaiting_human_input`
- `suspended_waiting_for_input`
- `completed`
- `failed`

Key behavioral changes:

- when user input is first detected for a pending agent command, mark the execution as `awaiting_human_input`
- expose that transition to the agent runtime through a structured callback or event surface
- on human-input timeout, do not destroy the pending execution object if the command is still in progress
- instead, mark it `suspended_waiting_for_input` and retain the binding needed to continue waiting later

This is the critical design decision for true resume semantics. If the pending execution is destroyed on timeout, “continue waiting” becomes a fake restart instead of a real resume.

### 2. Tool Execution Can Pause On A Human Gate

`ToolExecutor` should stop treating approval as a terminal error envelope.

Instead:

- the executor returns a structured pause outcome
- the runtime opens a `HumanGate`
- the run transitions into `waiting_for_human`

The same pattern should apply to terminal input. The runtime must understand that a tool call can:

- succeed
- fail
- pause on a gate

This requires promoting pause semantics into the agent runtime contract instead of encoding them as failed tool results.

### 3. AgentRuntime Owns Gate Lifecycle

`agentRuntime.run()` should own:

- run state
- open gate creation
- gate resolution/rejection/expiration transitions
- resuming the paused step from the same execution context

For `terminal_input`:

- the tool call has already been sent
- the runtime waits on the same underlying pending execution
- when the command completes, the original step continues naturally

For `approval`:

- the tool call has not yet executed
- resolving the gate allows execution to proceed
- rejecting the gate produces a structured tool rejection result that the model can react to

## Event Model

Add explicit gate events to the stream contract.

Recommended new events:

- `human_gate_opened`
- `human_gate_resolved`
- `human_gate_rejected`
- `human_gate_expired`
- `run_state_changed`

Example event intent:

- `human_gate_opened`: explain why the run is waiting and what the user must do
- `human_gate_expired`: show that the run is suspended but recoverable
- `human_gate_resolved`: indicate the run is moving back into active execution

`approval_required` should be retired as the primary UX event and replaced by `human_gate_opened(kind=approval)`.

## API Surface

The current streaming run creation endpoint remains:

- `POST /api/agent/runs`

Add gate action endpoints:

- `POST /api/agent/runs/:runId/gates/:gateId/resolve`
- `POST /api/agent/runs/:runId/gates/:gateId/reject`
- `POST /api/agent/runs/:runId/gates/:gateId/resume-waiting`

Rules:

- `resolve` is primarily for `approval`
- `reject` is primarily for `approval`
- `resume-waiting` is only valid for `terminal_input`

Suggested response shape:

- current run state
- gate state
- whether streaming should reconnect or an existing stream will continue

For this in-memory v1, the simpler model is:

- the original SSE stream ends when a run becomes `suspended`
- the client uses a resume action endpoint
- the server starts a fresh SSE continuation stream for the resumed run

This avoids holding idle HTTP streams indefinitely while still preserving run identity and execution context.

## Continuation Semantics

Resuming a suspended run must not create a new run.

Requirements:

- same `runId`
- same accumulated timeline
- same step context
- same open session binding
- same underlying pending terminal execution for `terminal_input`

Implementation direction:

- store resumable run state in an in-memory `AgentRunRegistry`
- a resumed stream attaches to the existing run object
- the runtime continues from the paused point instead of restarting the conversation

This `AgentRunRegistry` should track:

- run metadata
- current state
- open gate if any
- continuation function or suspended execution handle
- buffered timeline events needed for reconnecting the client

## Frontend Design

### Agent Timeline

The timeline should render a dedicated HITL card instead of treating the pause as a generic warning.

For `terminal_input`, show:

- reason
- bound session label
- command preview
- timeout/suspension state
- action when suspended: `继续等待`

For `approval`, show:

- reason
- policy summary
- action buttons: `批准` / `拒绝`

### Terminal Pane

When a session is bound to an open or suspended `terminal_input` gate, the terminal pane should show a persistent banner:

- session is currently locked by the agent
- the user should finish the interactive prompt here
- when suspended, the banner should expose or link the resume action

The terminal pane is the place where the user acts. The banner is mandatory to keep the interaction discoverable.

### Session Lock UX

While a `terminal_input` gate is active:

- command suggestions should be disabled
- utility drawer command execution into that session should be disabled
- script/library command injection into that session should be disabled
- any conflicting action should explain that the session is blocked by an agent HITL gate

## Error Handling

### Terminal Input

If the SSH session closes while a `terminal_input` gate is open or suspended:

- the gate becomes `rejected`
- the run becomes `failed`
- the error reason should explain that the interactive command context was lost

### Approval

If the user rejects an approval gate:

- the run should remain resumable within the current step
- the model receives a structured tool rejection result
- the agent can choose a safer alternative or stop with explanation

### Invalid Gate Actions

Examples:

- resolving an expired approval gate
- resuming a non-terminal-input gate
- operating on a gate that does not belong to the selected run

These must return stable API errors and must not mutate runtime state.

## Testing Strategy

### Server Runtime Tests

Add coverage for:

- opening a `terminal_input` gate when command interaction is detected
- automatic gate resolution when the command later completes
- timeout causing `human_gate_expired` and run suspension instead of run failure
- resume-waiting reattaching to the same pending execution
- opening an `approval` gate instead of producing an immediate failed tool result
- resolve/reject flows for approval

### SessionRegistry Tests

Extend coverage for:

- pending execution state transitions into `awaiting_human_input`
- timeout transitions into `suspended_waiting_for_input`
- later command completion after suspension
- resuming the suspended wait without losing the original markers

### HTTP/API Tests

Add coverage for:

- gate action endpoints
- invalid action handling
- resumed SSE continuation for an existing run

### Frontend Tests

Add coverage for:

- timeline mapping of new gate events
- terminal banner rendering for active and suspended `terminal_input` gates
- approval card actions
- disabled command injection affordances when session lock is active

## Implementation Notes

Recommended code organization:

- `server/agent/agentRunRegistry.ts`
  - in-memory run and gate tracking
- `server/agent/humanGateTypes.ts`
  - shared run/gate state definitions
- `server/agent/sessionRegistry.ts`
  - pending execution state machine for interactive command waits
- `server/agent/toolExecutor.ts`
  - pause-aware tool execution results
- `server/agent/agentRuntime.ts`
  - run lifecycle and continuation orchestration
- `server/http/agentRoutes.ts`
  - gate action endpoints and resume stream wiring
- `src/features/workbench/types.agent.ts`
  - gate and run-state stream events
- `src/features/workbench/useAgentRun.ts`
  - continuation-aware client state
- `src/features/workbench/AiAssistantPanel.tsx`
  - HITL cards and actions
- `src/features/workbench/SshTerminalPane.tsx`
  - session lock banner

## Open Decisions Closed By This Design

This design makes the following decisions explicit:

- use a unified HITL system, not per-feature pause flows
- require terminal interaction to happen in the terminal pane, not the AI panel
- lock the session while a terminal-input gate is active
- treat timeout as suspension, not failure
- make `approval` and `terminal_input` use the same gate lifecycle
- keep v1 in memory and defer persistence

## Summary

The core change is conceptual: “human involvement” becomes a normal runtime state rather than an error.

That lets OpsClaw support:

- interactive commands that can pause and later continue
- high-risk approvals that pause before execution
- a single UX model for suspended and resumable agent work

This is the right foundation for HITL in the workbench because it aligns the runtime model, transport model, and UI model around the same explicit gate semantics.
