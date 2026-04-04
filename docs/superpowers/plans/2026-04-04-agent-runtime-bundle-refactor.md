# Agent Runtime Bundle Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure OpsClaw's agent stack so runtime assembly, loop execution, and workbench-facing state are cleaner, more modular, and easier to extend toward durable HITL runs.

**Architecture:** Introduce a single runtime bundle factory as the dependency composition root, then progressively split the current monolithic runtime into orchestration, loop execution, and protocol layers. Preserve the current HTTP/SSE and workbench behavior while reducing hidden coupling between server assembly, tool execution, and frontend state handling.

**Tech Stack:** TypeScript, Express SSE, React, node:test, tsx

---

## File Map

### New Files

- `server/agent/runtimeBundle.ts`
  - Central agent dependency composition root used by `serverApp`.
- `server/agent/runtimeBundle.test.ts`
  - Verifies bundle creation wires expected dependencies and defaults.
- `server/agent/agentLoop.ts`
  - Pure agent loop executor for model-step iteration and tool-result turn construction.
- `server/agent/agentLoop.test.ts`
  - Verifies loop semantics independent of HITL/session orchestration.
- `server/http/agentEventStream.ts`
  - Shared SSE event writer/serializer used by agent HTTP routes.
- `src/features/workbench/agentSessionModel.ts`
  - Centralized session-lock and gate-to-workbench state mapping helpers.
- `src/features/workbench/agentSessionModel.test.ts`
  - Covers shared session-lock semantics for terminal and panel surfaces.

### Existing Files To Modify

- `server/serverApp.ts`
- `server/http/agentRoutes.ts`
- `server/agent/agentRuntime.ts`
- `server/agent/agentRuntime.test.ts`
- `server/agent/toolExecutor.ts`
- `server/agent/toolTypes.ts`
- `server/agent/agentTypes.ts`
- `server/agent/agentRunRegistry.ts`
- `src/features/workbench/useAgentRun.ts`
- `src/features/workbench/useAgentRunModel.ts`
- `src/features/workbench/types.agent.ts`
- `src/features/workbench/SshTerminalPane.tsx`
- `src/features/workbench/useSshTerminalRuntime.ts`
- `src/features/workbench/useSshTerminalController.ts`
- `src/features/workbench/AiAssistantPanel.tsx`
- `src/features/workbench/agentGateUiModel.ts`

---

## Phase 1: Runtime Bundle Composition Root

**Files:**
- Create: `server/agent/runtimeBundle.ts`
- Create: `server/agent/runtimeBundle.test.ts`
- Modify: `server/serverApp.ts`
- Modify: `server/agent/agentRuntime.ts`

- [x] Extract current `serverApp` agent wiring into `createAgentRuntimeBundle()` so `serverApp` stops manually instantiating every agent dependency.
- [x] Keep runtime behavior unchanged: same `SessionRegistry`, `ToolExecutor`, `OpsAgentRuntime`, `FileMemoryStore`, and HTTP registration flow.
- [x] Add bundle tests that assert defaults and optional overrides remain stable.
- [ ] Verify with:
  - `pnpm exec tsx --test server/agent/runtimeBundle.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.server.json`

## Phase 2: Split Loop Execution From Orchestration

**Files:**
- Create: `server/agent/agentLoop.ts`
- Create: `server/agent/agentLoop.test.ts`
- Modify: `server/agent/agentRuntime.ts`
- Modify: `server/agent/toolExecutor.ts`

- [x] Move pure model/tool iteration logic out of `OpsAgentRuntime` into `agentLoop.ts`.
- [x] Keep run lifecycle, gate lifecycle, continuation, and SSE emission inside `OpsAgentRuntime`.
- [x] Ensure tool pause outcomes still compose through the orchestration layer without changing external route behavior.
- [ ] Verify with:
  - `pnpm exec tsx --test server/agent/agentLoop.test.ts server/agent/agentRuntime.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.server.json`

## Phase 3: Stabilize Agent Event Protocol

**Files:**
- Create: `server/http/agentEventStream.ts`
- Modify: `server/http/agentRoutes.ts`
- Modify: `server/agent/agentTypes.ts`
- Modify: `src/features/workbench/types.agent.ts`
- Modify: `src/features/workbench/useAgentRun.ts`
- Modify: `src/features/workbench/useAgentRunModel.ts`

- [x] Make server-side SSE writing go through a dedicated event stream helper.
- [x] Align server and frontend event shapes so new agent events have one authoritative mapping path.
- [x] Keep workbench timeline logic pure and focused on projection, not transport concerns.
- [ ] Verify with:
  - `pnpm exec tsx --test server/http/agentRoutes.test.ts src/features/workbench/useAgentRunModel.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.server.json`
  - `pnpm exec tsc --noEmit -p tsconfig.app.json`

## Phase 4: Durable Run Snapshot Foundation

**Files:**
- Modify: `server/agent/agentRunRegistry.ts`
- Modify: `server/agent/agentRuntime.ts`
- Modify: `server/http/agentRoutes.ts`
- Modify: `src/features/workbench/agentApi.ts`
- Modify: `src/features/workbench/useAgentRun.ts`

- [x] Add a persistence seam for run/gate snapshots without forcing storage logic into the registry core.
- [x] Define the minimal query APIs needed for frontend reattachment to suspended runs.
- [x] Preserve current in-memory semantics first; durable storage can remain behind an interface until behavior is stable.
- [ ] Verify with:
  - `pnpm exec tsx --test server/agent/agentRunRegistry.test.ts server/agent/agentRuntime.test.ts server/http/agentRoutes.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.server.json`

## Phase 5: Workbench Session Coordination Model

**Files:**
- Create: `src/features/workbench/agentSessionModel.ts`
- Create: `src/features/workbench/agentSessionModel.test.ts`
- Modify: `src/features/workbench/SshTerminalPane.tsx`
- Modify: `src/features/workbench/useSshTerminalRuntime.ts`
- Modify: `src/features/workbench/useSshTerminalController.ts`
- Modify: `src/features/workbench/AiAssistantPanel.tsx`
- Modify: `src/features/workbench/agentGateUiModel.ts`

- [x] Centralize gate-to-session lock derivation so terminal panes, utility entry points, and AI panel affordances all use one rule set.
- [x] Remove duplicated lock checks scattered across panel and terminal hooks where possible.
- [ ] Verify with:
  - `pnpm exec tsx --test src/features/workbench/agentSessionModel.test.ts src/features/workbench/agentGateUiModel.test.ts src/features/workbench/useAgentRunModel.test.ts`
  - `pnpm exec tsc --noEmit -p tsconfig.app.json`

## Phase 6: Task/Subagent Surface Preparation

**Files:**
- Create: `server/agent/taskTypes.ts`
- Create: `server/agent/taskRegistry.ts`
- Add tests only after interface settles

- [x] Define task-facing types and registry boundaries without yet introducing a full subprocess orchestration layer.
- [x] Ensure the abstraction is shaped around OpsClaw's SSH-session and run model, not around generic local shell jobs.
- [ ] Verify with:
  - `pnpm exec tsc --noEmit -p tsconfig.server.json`

---

## Execution Notes

- This plan starts on branch `feature/agent-runtime-bundle` in worktree `.worktrees/agent-runtime-bundle`.
- Baseline verification completed before implementation:
  - `pnpm exec tsc --noEmit -p tsconfig.server.json`
  - `pnpm exec tsc --noEmit -p tsconfig.app.json`
- Current execution target: **Completed through Phase 6**
