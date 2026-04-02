# Agent Step Budget Renewal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve complex-task completion rate by adding progress-aware automatic step-budget renewal to the OpsClaw agent runtime.

**Architecture:** Keep the current step loop in the server runtime, but replace the fixed `maxSteps` exhaustion behavior with a bounded renewal policy. The runtime emits explicit budget-status events so the frontend can explain whether the run was auto-extended or stopped for lack of progress.

**Tech Stack:** TypeScript, Node.js, SSE streaming, React

---

### Task 1: Lock Renewal Semantics With Runtime Tests

**Files:**
- Modify: `server/agent/agentRuntime.test.ts`
- Test: `server/agent/agentRuntime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that cover:
- a run that reaches the initial budget, receives an automatic renewal, and completes
- a run that reaches the budget without meaningful progress and fails with the new exhaustion reason

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`
Expected: FAIL because renewal behavior and new events are not implemented yet.

- [ ] **Step 3: Write minimal implementation**

Implement only the runtime state and event changes needed to satisfy the new tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/agent/agentRuntime.test.ts server/agent/agentRuntime.ts server/agent/agentTypes.ts server/agent/agentPrompt.ts
git commit -m "feat: add agent budget renewal"
```

### Task 2: Surface Budget Status In The Frontend Timeline

**Files:**
- Modify: `src/features/workbench/types.agent.ts`
- Modify: `src/features/workbench/useAgentRun.ts`
- Modify: `src/features/workbench/AiAssistantPanel.tsx`

- [ ] **Step 1: Write the failing test**

Use an existing model/unit style test if available; otherwise validate through targeted type-safe event handling in `useAgentRun.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm typecheck`
Expected: FAIL until frontend event types are updated.

- [ ] **Step 3: Write minimal implementation**

Teach the client timeline to show renewal and exhaustion/no-progress status messages without changing the existing tool/result rendering.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/workbench/types.agent.ts src/features/workbench/useAgentRun.ts src/features/workbench/AiAssistantPanel.tsx
git commit -m "feat: show agent budget renewal status"
```

### Task 3: Verify Runtime And UI Integration

**Files:**
- Modify: `server/http/agentRoutes.ts` (only if transport typing needs adjustment)
- Test: `server/agent/agentRuntime.test.ts`

- [ ] **Step 1: Run targeted verification**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`
Expected: PASS

- [ ] **Step 2: Run static checks**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/http/agentRoutes.ts
git commit -m "chore: verify agent renewal flow"
```
