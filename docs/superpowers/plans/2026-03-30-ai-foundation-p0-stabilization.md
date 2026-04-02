# AI Foundation P0 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the AI foundation by fixing secret exposure, restoring real multi-turn chat context, hardening default-provider state, and returning the repo to a passing lint/type/build baseline.

**Architecture:** Keep the existing React + Express structure, but tighten API contracts at the server boundary so secrets stay server-side and UI edit flows become explicit patch-style updates. Add focused server tests around provider/chat behavior, then use those constraints to drive minimal front-end changes and final lint cleanup.

**Tech Stack:** React 19, TypeScript, Express 5, sql.js, node:test, ESLint, Vite

---

### Task 1: Lock Down Secret Serialization

**Files:**
- Modify: `server/nodeStore.ts`
- Modify: `server/llmProviderStore.ts`
- Modify: `server/index.ts`
- Modify: `src/features/workbench/api.ts`
- Modify: `src/features/workbench/types.ts`
- Modify: `src/features/workbench/ConnectionPanel.tsx`
- Modify: `src/features/workbench/LlmSettings.tsx`
- Modify: `src/features/workbench/LlmProviderSettings.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`
- Test: `server/p0.stabilization.test.ts`

- [ ] Write failing tests that prove node detail and LLM provider list responses must not expose decrypted secrets.
- [ ] Run `pnpm exec tsx --test server/p0.stabilization.test.ts` and confirm the new assertions fail for current serialization behavior.
- [ ] Introduce server-side sanitized response shapes for node detail and LLM providers, keeping secrets available only to server-internal SSH / LLM execution paths.
- [ ] Convert front-end edit flows to patch semantics: empty secret fields mean “keep existing value”, explicit non-empty values mean “replace”.
- [ ] Re-run `pnpm exec tsx --test server/p0.stabilization.test.ts` and confirm the new secrecy assertions pass.

### Task 2: Restore Real Multi-Turn Chat Context

**Files:**
- Modify: `server/llmClient.ts`
- Modify: `server/index.ts`
- Modify: `src/features/workbench/llmApi.ts`
- Modify: `src/features/workbench/useStreamingChat.ts`
- Modify: `src/features/workbench/AiAssistantPanel.tsx`
- Test: `server/p0.stabilization.test.ts`

- [ ] Write a failing test that proves assistant history is forwarded into the chat completion context instead of dropping all prior assistant replies.
- [ ] Run `pnpm exec tsx --test server/p0.stabilization.test.ts` and confirm the chat-context assertion fails.
- [ ] Update chat context building so system, user, and assistant messages are preserved in order for multi-turn chat.
- [ ] Make the streaming chat hook handle abort and error transitions without leaving stale busy/error state behind.
- [ ] Re-run `pnpm exec tsx --test server/p0.stabilization.test.ts` and confirm the multi-turn chat assertion passes.

### Task 3: Harden Default Provider State

**Files:**
- Modify: `server/llmProviderStore.ts`
- Modify: `server/index.ts`
- Modify: `src/features/workbench/AiAssistantPanel.tsx`
- Modify: `src/features/workbench/LlmSettings.tsx`
- Modify: `src/features/workbench/LlmProviderSettings.tsx`
- Test: `server/p0.stabilization.test.ts`

- [ ] Write failing tests that prove setting a missing provider as default must not clear the existing default.
- [ ] Run `pnpm exec tsx --test server/p0.stabilization.test.ts` and confirm the default-provider assertion fails.
- [ ] Update provider-store default switching to validate existence before mutating state, and return explicit route errors when the target provider does not exist.
- [ ] Add a deterministic UI fallback in the AI panel when no enabled default provider is present, selecting the first enabled provider/model or showing a clear blocked state.
- [ ] Re-run `pnpm exec tsx --test server/p0.stabilization.test.ts` and confirm the provider-state assertion passes.

### Task 4: Recover Tooling Baseline

**Files:**
- Modify: `eslint.config.js`
- Modify: `server/index.ts`
- Modify: `server/llmProviderStore.ts`
- Modify: `src/components/ui/MarkdownContent.tsx`
- Modify: `src/features/workbench/CsvImportModal.tsx`
- Modify: `src/features/workbench/LlmProviderSettings.tsx`
- Modify: `src/features/workbench/LlmSettings.tsx`
- Modify: `src/features/workbench/SshTerminalPane.tsx`
- Modify: `src/features/workbench/TerminalWorkspace.tsx`
- Modify: `src/features/workbench/useStreamingChat.ts`
- Modify: `src/lib/utils.ts`
- Modify: `src/routes/SettingsPage.tsx`

- [ ] Narrow ESLint scope so generated output and local skill fixtures are not type-checked as app code.
- [ ] Fix the real lint errors in files touched by the stabilization work, keeping behavior unchanged except where already covered by Tasks 1-3.
- [ ] Run `pnpm lint` and confirm it passes.
- [ ] Run `pnpm typecheck` and confirm it passes.
- [ ] Run `pnpm build` and confirm it passes.
- [ ] Run `pnpm exec tsx --test server/agent/agentRuntime.test.ts` and `pnpm exec tsx --test server/p0.stabilization.test.ts` and confirm both pass.
