# LLM Provider Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users customize LLM provider `baseUrl` and model selection while preserving built-in provider presets and adding an OpenAI-compatible custom provider.

**Architecture:** Extend the provider persistence model with `defaultModel` and `openai_compatible`, centralize provider template defaults, and update the settings UI to merge preset candidates with user-defined models instead of hardcoding a fixed provider/model matrix.

**Tech Stack:** TypeScript, Node.js, sql.js, Express, React

---

### Task 1: Lock Backend Provider Semantics With Tests

**Files:**
- Modify: `server/serverApp.test.ts`
- Modify: `server/llmRoutes.test.ts` (only if route parsing coverage is needed)
- Test: `server/serverApp.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests that cover:
- creating an `openai_compatible` provider with custom `baseUrl`, `models`, and `defaultModel`
- listing the provider with `defaultModel` preserved and secret fields sanitized
- updating a provider so `defaultModel` remains valid when the model list changes

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test server/serverApp.test.ts`
Expected: FAIL because the backend currently rejects `openai_compatible` and does not persist `defaultModel`.

- [ ] **Step 3: Write minimal implementation**

Update database migration, provider store normalization, request parsing, and runtime model building just enough to satisfy the tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test server/serverApp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/database.ts server/http/support.ts server/llmClient.ts server/llmProviderStore.ts server/serverApp.test.ts
git commit -m "feat: support customizable llm providers"
```

### Task 2: Lock Preferred Model Selection On The Frontend

**Files:**
- Modify: `src/features/workbench/aiAssistantPanelModel.test.ts`
- Modify: `src/features/workbench/types.ts`
- Modify: `src/features/workbench/aiAssistantPanelModel.ts`
- Test: `src/features/workbench/aiAssistantPanelModel.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test proving the preferred AI model uses `defaultModel` when present and falls back to the first configured model otherwise.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/features/workbench/aiAssistantPanelModel.test.ts`
Expected: FAIL because the model picker still assumes `models[0]`.

- [ ] **Step 3: Write minimal implementation**

Extend the shared provider type with `defaultModel` and update preferred-model selection to honor it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test src/features/workbench/aiAssistantPanelModel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/workbench/types.ts src/features/workbench/aiAssistantPanelModel.ts src/features/workbench/aiAssistantPanelModel.test.ts
git commit -m "feat: honor default llm model in assistant picker"
```

### Task 3: Ship Provider Editing UX With Presets And Overrides

**Files:**
- Modify: `src/features/workbench/api.ts`
- Modify: `src/features/workbench/LlmSettings.tsx`
- Create: `src/features/workbench/llmProviderTemplates.ts` (if needed)
- Test: `pnpm exec tsc --noEmit -p tsconfig.app.json`

- [ ] **Step 1: Write the failing test or type expectation**

Use existing typed surfaces to force the new request/response shape (`providerType`, `baseUrl`, `models`, `defaultModel`) through the UI code.

- [ ] **Step 2: Run verification to expose the gap**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: FAIL until the frontend form and API types understand the new provider model.

- [ ] **Step 3: Write minimal implementation**

Add provider templates, `openai_compatible`, editable `baseUrl`, preset-plus-custom model management, and `defaultModel` selection without overwriting user-edited values during plain edit flows.

- [ ] **Step 4: Run verification to confirm it passes**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/workbench/api.ts src/features/workbench/LlmSettings.tsx src/features/workbench/llmProviderTemplates.ts
git commit -m "feat: add customizable llm provider settings"
```

### Task 4: Final Verification

**Files:**
- Modify: none unless verification exposes a regression

- [ ] **Step 1: Run backend tests**

Run: `pnpm exec tsx --test server/serverApp.test.ts server/llmRoutes.test.ts`
Expected: PASS

- [ ] **Step 2: Run frontend tests**

Run: `pnpm exec tsx --test src/features/workbench/aiAssistantPanelModel.test.ts`
Expected: PASS

- [ ] **Step 3: Run server typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 4: Run app typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.app.json`
Expected: PASS
