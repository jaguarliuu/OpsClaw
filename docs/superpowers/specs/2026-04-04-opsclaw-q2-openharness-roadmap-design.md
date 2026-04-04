# OpsClaw Q2 OpenHarness Absorption Roadmap

## Goal

Define the Q2 iteration roadmap for how OpsClaw should absorb the useful parts of OpenHarness after the agent runtime refactor is complete.

This document is not a generic comparison memo. It is an execution-oriented roadmap that answers four questions:

- what OpsClaw already completed in the runtime refactor
- what OpenHarness capabilities are still worth learning from
- what should not be copied directly
- what sequence OpsClaw should follow through Q2

## Context

OpsClaw has already completed a major agent runtime refactor. That work cleaned up the internal structure of the existing agent stack, but it did not yet deliver the broader agent harness capabilities that OpenHarness exposes.

What OpsClaw already has now:

- runtime dependency assembly split out through `server/agent/runtimeBundle.ts`
- agent loop execution split out through `server/agent/agentLoop.ts`
- server SSE protocol and frontend event projection stabilized
- run snapshot persistence seam and reattach query foundation
- workbench-side gate and session lock coordination model
- task registry and task types added only as a seam, not yet wired into the runtime

What this means:

- OpsClaw is no longer blocked by runtime structure
- the next quarter should focus on durable state, orchestration, and agent control plane capabilities
- the Q2 work should build on the new seams instead of reopening the runtime refactor itself

## What OpenHarness Actually Offers

OpenHarness is useful less because of scale and more because of boundary design. Its real value is that it cuts the agent harness into small, composable subsystems.

Relevant subsystems observed in the current codebase:

- `tasks/manager.py`
  - background shell and local-agent task management
  - task creation, restart, input streaming, output tailing, task listing
- `permissions/checker.py`
  - one place for permission-mode decisions, path rules, and command deny rules
- `hooks/executor.py`
  - event-driven hook execution for command, HTTP, prompt, and agent hooks
- `coordinator/coordinator_mode.py`
  - minimal team and agent grouping model
- `skills/`, `plugins/`, `commands/`
  - Markdown-first knowledge and command-driven workflow extensions
- `memory/` and session storage services
  - persistent context outside the single in-memory run

The important lesson is not “copy OpenHarness architecture.” The lesson is:

- keep runtime loop small
- move orchestration and product behavior into adjacent control-plane modules
- make durable state and workflow surfaces first-class

## What OpsClaw Should Not Copy

### 1. Do not copy OpenHarness module names as product boundaries

OpenHarness is a general-purpose harness. OpsClaw is an SSH-centered operations workbench. Its core unit is still the bound SSH session and the operator workflow around that session.

That means OpsClaw should not force its design into OpenHarness-shaped buckets such as:

- generic local shell task abstractions
- generic team registry semantics
- provider-agnostic command UX as a primary product surface

OpsClaw should keep its own product boundaries:

- session
- run
- gate
- task
- thread
- operator approval and recovery flow

### 2. Do not replace the current runtime with a bigger harness loop

The runtime refactor already produced the right separation:

- runtime assembly
- loop execution
- transport protocol
- workbench projection

Q2 should build on those seams. It should not reopen the loop architecture just to look more like OpenHarness.

### 3. Do not adopt generic background subprocess behavior as the primary execution model

OpenHarness tasks are centered on shell subprocesses and local agent subprocesses. OpsClaw’s execution center remains:

- SSH session-bound commands
- agent runs bound to sessions
- HITL gates bound to sessions and runs

Background task support is useful, but it must serve OpsClaw’s session/run model rather than replace it.

## Q2 Roadmap

The quarter should be executed in three waves. Each wave should leave behind usable product behavior, not only internal abstractions.

### Wave 1: Durable State And Recovery Foundation

#### Goal

Turn the current in-memory run and gate model into a recoverable, session-bound state layer.

#### Why this comes first

Without durable thread and task state:

- subagent orchestration cannot survive UI interruption
- background work cannot be trusted
- approval and terminal-input recovery remain fragile
- workbench still behaves like a transient panel instead of a long-lived operator workspace

#### Scope

- implement session conversation thread persistence
- persist run snapshots, gate snapshots, and task records
- wire the existing `taskRegistry` seam into the runtime
- add rehydrate flows for active session threads, suspended runs, and waiting tasks
- surface recovery state in the workbench

#### OpenHarness lesson being absorbed

- durable session-oriented control state belongs outside the loop
- task state and conversation state should be queryable independently from active execution

#### OpsClaw product outcome

- operator closes panel or refreshes page and comes back to the same session thread
- suspended run can be rediscovered and resumed
- terminal-input and approval pauses remain inspectable after the original request context is gone

#### Explicit non-goals

- no full event-sourcing platform
- no cross-machine orchestration
- no general-purpose shell task dashboard beyond session-linked needs

### Wave 2: Task And Subagent Orchestration Control Plane

#### Goal

Promote tasks from passive records into executable orchestration primitives for child work.

#### Why this is second

Subagent or child-task orchestration without durable task state would produce brittle behavior and confusing recovery semantics. Wave 1 provides the persistence foundation needed for this layer.

#### Scope

- define runtime-owned task lifecycle transitions
- support child task creation from a parent run
- add a subagent execution contract shaped around OpsClaw sessions
- support background observation, progress, cancellation, and completion collection
- distinguish between:
  - session-bound command task
  - child agent task
  - parent orchestration task

#### OpenHarness lesson being absorbed

- background task management should be explicit and inspectable
- agent coordination should be modeled as tasks, not hidden recursive prompts

#### OpsClaw product outcome

- a parent run can delegate bounded work without losing control state
- operators can see what child work is active, waiting, failed, or finished
- future multi-agent flows have a stable substrate instead of ad-hoc branching logic

#### Explicit non-goals

- no free-form multi-agent team product surface yet
- no fully generic “team registry” copied from OpenHarness
- no detached local shell agent ecosystem

### Wave 3: Permission, Hooks, And Workflow Productization

#### Goal

Unify approval, policy, hooks, and reusable workflow entry points into one agent control plane.

#### Why this is third

This layer becomes much cleaner once durable state and task orchestration already exist. Otherwise hooks and permission flows become another set of one-off code paths.

#### Scope

- unify command policy, approval policy, and future task policy under one control-plane model
- add hook points around tool execution, run lifecycle, gate lifecycle, and task lifecycle
- define a command/workflow surface for reusable operator actions
- add workbench views for:
  - task recovery
  - approval queue
  - run audit and recovery context
- define the first constrained skill/plugin-style extension surface for OpsClaw

#### OpenHarness lesson being absorbed

- permissions belong in one decision layer
- hooks should be event-driven, not scattered callbacks
- reusable workflows need explicit command surfaces, not only prompt conventions

#### OpsClaw product outcome

- high-risk work is governed through one visible control plane
- future workflow automation has extension points
- operator and agent collaboration becomes inspectable and controllable, not purely conversational

#### Explicit non-goals

- no attempt to clone Claude-style plugin compatibility wholesale
- no broad marketplace or plugin ecosystem in Q2
- no generic slash-command shell as a primary UI metaphor

## Capability Mapping

The following table summarizes the intended absorption path.

| OpenHarness idea | OpsClaw current state | Q2 action |
| --- | --- | --- |
| Background task manager | Task seam exists but is not wired | Make `taskRegistry` runtime-owned and durable in Wave 1, then executable in Wave 2 |
| Local agent / child agent task model | No child-run orchestration yet | Add session-aware child task contract in Wave 2 |
| Permission checker | Command policy exists, approvals exist, but not one unified control plane | Consolidate policy decisions and task/run permissions in Wave 3 |
| Hook executor | No general hook layer yet | Add lifecycle hook points in Wave 3 |
| Skills / commands / plugins | Internal skills exist for development process, not product workflow | Add constrained OpsClaw workflow surface in Wave 3 |
| Session storage / memory services | Conversation persistence design exists but not fully wired | Implement session thread persistence in Wave 1 |

## Recommended Execution Order

The Q2 order should be strict:

1. durable threads, runs, gates, and task persistence
2. task execution and subagent orchestration
3. permission, hooks, and workflow productization

The main reason is dependency direction:

- orchestration depends on durable task state
- hooks and workflow productization depend on stable lifecycle events
- if the order is reversed, Q2 will accumulate another layer of glue code around transient runtime state

## Result Expected At End Of Q2

If the roadmap succeeds, OpsClaw should no longer behave like a one-shot agent panel attached to a terminal.

It should behave like:

- a session-bound long-lived operator workspace
- with recoverable runs and gates
- with inspectable child tasks and subagent work
- with a visible control plane for permissions, approvals, and lifecycle automation

That is the correct way to absorb OpenHarness: not by cloning its shape, but by adopting its discipline around boundaries, state, and control surfaces.

