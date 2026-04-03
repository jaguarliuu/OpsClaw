# Terminal Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a session-area-only context menu for the SSH terminal with `复制` / `粘贴` / `全选`.

**Architecture:** Reuse the existing workbench context-menu pattern in the renderer instead of wiring a global Electron menu. Keep clipboard behavior centralized in the SSH terminal runtime so keyboard shortcuts and right-click paste share the same code path.

**Tech Stack:** React 19, xterm.js, existing workbench context-menu patterns, Node test runner

---

### Task 1: Model The Terminal Context Menu

**Files:**
- Create: `src/features/workbench/sshTerminalContextMenuModel.ts`
- Create: `src/features/workbench/sshTerminalContextMenuModel.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run `pnpm exec tsx --test src/features/workbench/sshTerminalContextMenuModel.test.ts` and verify it fails**
- [ ] **Step 3: Implement the minimal model for open/close/enable-state behavior**
- [ ] **Step 4: Re-run `pnpm exec tsx --test src/features/workbench/sshTerminalContextMenuModel.test.ts` and verify it passes**

### Task 2: Wire A Terminal-Only Context Menu

**Files:**
- Create: `src/features/workbench/useSshTerminalContextMenu.ts`
- Create: `src/features/workbench/SshTerminalContextMenu.tsx`
- Modify: `src/features/workbench/SshTerminalPane.tsx`
- Modify: `src/features/workbench/useSshTerminalRuntime.ts`

- [ ] **Step 1: Expose runtime actions for copy-selection, paste-from-clipboard, and select-all**
- [ ] **Step 2: Add a renderer context-menu hook scoped to the terminal pane**
- [ ] **Step 3: Render the terminal context menu and invoke the runtime actions**
- [ ] **Step 4: Keep outside-click / Escape close behavior aligned with existing session-tree menu UX**

### Task 3: Verify Integration

**Files:**
- Modify: `src/features/workbench/sshTerminalContextMenuModel.test.ts`

- [ ] **Step 1: Run `pnpm exec tsx --test src/features/workbench/sshTerminalContextMenuModel.test.ts`**
- [ ] **Step 2: Run `pnpm exec tsc --noEmit -p tsconfig.app.json`**
- [ ] **Step 3: Run `pnpm exec tsc --noEmit -p tsconfig.electron.json`**
- [ ] **Step 4: Run `pnpm desktop:build`**
