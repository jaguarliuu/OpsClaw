# Electron Desktop Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OpsClaw 接入 Electron 桌面壳，托管现有 Node backend，并跑通开发态、生产态和 macOS 本地打包。

**Architecture:** 先做运行时前置改造，把 backend 端口与数据目录从固定假设中解耦，再接 Electron main/preload 和 backend 子进程托管，最后补构建与打包脚本。前端 renderer 通过 preload/runtime config 获取 backend base URL，避免继续写死 `localhost:4000`。

**Tech Stack:** TypeScript, Electron, electron-builder, React, Vite, Node child_process, sql.js, node:test

---

### Task 1: Refactor runtime paths and backend startup inputs

**Files:**
- Create: `server/runtimePaths.ts`
- Create: `server/runtimePaths.test.ts`
- Modify: `server/database.ts`
- Modify: `server/serverApp.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Write the failing runtime path tests**

```ts
void test('resolveOpsClawDataDir prefers OPSCLAW_DATA_DIR over cwd fallback', async () => {
  const { resolveOpsClawDataDir } = await import('./runtimePaths.js');

  assert.equal(
    resolveOpsClawDataDir({
      cwd: '/tmp/project',
      env: { OPSCLAW_DATA_DIR: '/tmp/custom-data' },
    }),
    '/tmp/custom-data'
  );
});

void test('resolveDatabaseFilePath nests sqlite under the chosen data directory', async () => {
  const { resolveDatabaseFilePath } = await import('./runtimePaths.js');

  assert.equal(
    resolveDatabaseFilePath('/tmp/opsclaw-user-data'),
    '/tmp/opsclaw-user-data/data/opsclaw.sqlite'
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test server/runtimePaths.test.ts`
Expected: FAIL because `server/runtimePaths.ts` does not exist yet.

- [ ] **Step 3: Implement runtime path resolution and plumb it into the backend**

```ts
export function resolveOpsClawDataDir(input: { cwd: string; env: NodeJS.ProcessEnv }) {
  const configured = input.env.OPSCLAW_DATA_DIR?.trim();
  if (configured) {
    return configured;
  }

  return path.resolve(input.cwd, 'data');
}
```

```ts
const dataDir = resolveOpsClawDataDir({ cwd: process.cwd(), env: process.env });
const databaseFilePath = resolveDatabaseFilePath(dataDir);
```

```ts
export async function startOpsClawServer(options?: { port?: number }) {
  const port = options?.port ?? Number(process.env.PORT ?? 4000);
  server.listen(port, () => {
    console.log(`OpsClaw SSH gateway listening on http://localhost:${port}`);
  });
}
```

- [ ] **Step 4: Run the targeted tests**

Run: `node --import tsx --test server/runtimePaths.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/runtimePaths.ts server/runtimePaths.test.ts server/database.ts server/serverApp.ts server/index.ts
git commit -m "refactor: support configurable backend runtime paths"
```

### Task 2: Make frontend server base resolution desktop-safe

**Files:**
- Create: `src/features/workbench/serverBaseModel.ts`
- Create: `src/features/workbench/serverBaseModel.test.ts`
- Modify: `src/features/workbench/serverBase.ts`
- Modify: `src/features/workbench/types.ts`

- [ ] **Step 1: Write the failing server base model tests**

```ts
void test('resolveServerHttpBaseUrl prefers desktop runtime config over vite env and window origin', () => {
  assert.equal(
    resolveServerHttpBaseUrl({
      runtime: { serverHttpBaseUrl: 'http://127.0.0.1:48321' },
      envHttpBaseUrl: 'http://localhost:4000',
      location: { protocol: 'http:', hostname: 'localhost', host: 'localhost:5173', port: '5173', origin: 'http://localhost:5173' },
    }),
    'http://127.0.0.1:48321'
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test src/features/workbench/serverBaseModel.test.ts`
Expected: FAIL because `serverBaseModel.ts` does not exist yet.

- [ ] **Step 3: Implement pure server base resolution and runtime typing**

```ts
export type OpsClawDesktopRuntime = {
  desktop: boolean;
  serverHttpBaseUrl: string;
  serverWebSocketBaseUrl: string;
};
```

```ts
export function resolveServerHttpBaseUrl(input: ResolveServerBaseInput) {
  if (input.runtime?.serverHttpBaseUrl) {
    return trimTrailingSlash(input.runtime.serverHttpBaseUrl);
  }
  if (input.envHttpBaseUrl) {
    return trimTrailingSlash(input.envHttpBaseUrl);
  }
  return deriveFromLocation(input.location).httpBaseUrl;
}
```

- [ ] **Step 4: Run the targeted tests**

Run: `node --import tsx --test src/features/workbench/serverBaseModel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/workbench/serverBaseModel.ts src/features/workbench/serverBaseModel.test.ts src/features/workbench/serverBase.ts src/features/workbench/types.ts
git commit -m "refactor: support desktop runtime server base resolution"
```

### Task 3: Add Electron main, preload, and backend process hosting

**Files:**
- Create: `electron/constants.ts`
- Create: `electron/backendProcess.ts`
- Create: `electron/backendProcess.test.ts`
- Create: `electron/window.ts`
- Create: `electron/preload.ts`
- Create: `electron/main.ts`
- Modify: `src/features/workbench/types.ts`

- [ ] **Step 1: Write the failing Electron backend process tests**

```ts
void test('buildBackendProcessEnv injects port and desktop data directory', async () => {
  const { buildBackendProcessEnv } = await import('../electron/backendProcess.js');

  const env = buildBackendProcessEnv({
    baseEnv: { PATH: '/usr/bin' },
    dataDir: '/tmp/opsclaw-user-data',
    port: 48321,
  });

  assert.equal(env.PORT, '48321');
  assert.equal(env.OPSCLAW_DATA_DIR, '/tmp/opsclaw-user-data');
  assert.equal(env.OPSCLAW_DESKTOP, '1');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test electron/backendProcess.test.ts`
Expected: FAIL because the Electron backend process module does not exist yet.

- [ ] **Step 3: Implement Electron bootstrap and backend process management**

```ts
export function buildBackendProcessEnv(input: {
  baseEnv: NodeJS.ProcessEnv;
  dataDir: string;
  port: number;
}) {
  return {
    ...input.baseEnv,
    OPSCLAW_DATA_DIR: input.dataDir,
    OPSCLAW_DESKTOP: '1',
    PORT: String(input.port),
  };
}
```

```ts
new BrowserWindow({
  width: 1440,
  height: 920,
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    preload: preloadPath,
  },
});
```

```ts
contextBridge.exposeInMainWorld('__OPSCLAW_RUNTIME__', {
  desktop: true,
  serverHttpBaseUrl,
  serverWebSocketBaseUrl,
});
```

- [ ] **Step 4: Run the targeted Electron tests**

Run: `node --import tsx --test electron/backendProcess.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/constants.ts electron/backendProcess.ts electron/backendProcess.test.ts electron/window.ts electron/preload.ts electron/main.ts src/features/workbench/types.ts
git commit -m "feat: add electron shell and backend host"
```

### Task 4: Wire build, dev, and packaging scripts

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `tsconfig.electron.json`
- Create: `electron-builder.yml`

- [ ] **Step 1: Write the failing build expectation**

```ts
assert.match(packageJson.scripts['desktop:build'], /tsc -p tsconfig\\.electron\\.json/);
assert.match(packageJson.scripts['desktop:pack'], /electron-builder/);
```

- [ ] **Step 2: Run a lightweight assertion check to confirm the scripts do not exist**

Run: `node --import tsx --eval "import('./package.json', { with: { type: 'json' } }).then(({default:p}) => { if (p.scripts['desktop:build']) process.exit(1); })"`
Expected: PASS because `desktop:build` is not defined yet.

- [ ] **Step 3: Add Electron build dependencies and scripts**

```json
{
  "scripts": {
    "desktop:dev": "concurrently \"pnpm dev:client\" \"pnpm dev:desktop\"",
    "dev:desktop": "pnpm desktop:build:electron && electron dist-electron/main.js",
    "desktop:build": "pnpm build && tsc -p tsconfig.electron.json",
    "desktop:pack": "pnpm desktop:build && electron-builder --mac dmg"
  }
}
```

```yaml
appId: com.opsclaw.desktop
productName: OpsClaw
files:
  - dist/**
  - dist-server/**
  - dist-electron/**
mac:
  target:
    - dmg
```

- [ ] **Step 4: Install/update dependencies and run a desktop build**

Run: `pnpm install`
Expected: lockfile updated with Electron build dependencies.

Run: `pnpm desktop:build`
Expected: PASS and `dist/`, `dist-server/`, `dist-electron/` all populated.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.electron.json electron-builder.yml
git commit -m "build: add electron desktop packaging"
```

### Task 5: End-to-end desktop verification

**Files:**
- Verify touched files only

- [ ] **Step 1: Run all targeted unit tests**

Run: `node --import tsx --test server/runtimePaths.test.ts src/features/workbench/serverBaseModel.test.ts electron/backendProcess.test.ts src/features/workbench/workbenchHeaderActionsModel.test.ts src/features/workbench/workbenchShortcutModel.test.ts src/features/workbench/utilityDrawerModel.test.ts src/features/workbench/scriptLibraryModel.test.ts`
Expected: PASS

- [ ] **Step 2: Run app typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run lint on touched files**

Run: `pnpm exec eslint server/runtimePaths.ts server/runtimePaths.test.ts server/database.ts server/serverApp.ts server/index.ts src/features/workbench/serverBase.ts src/features/workbench/serverBaseModel.ts src/features/workbench/serverBaseModel.test.ts src/features/workbench/types.ts electron/constants.ts electron/backendProcess.ts electron/backendProcess.test.ts electron/window.ts electron/preload.ts electron/main.ts package.json`
Expected: PASS or only unrelated pre-existing issues outside touched files.

- [ ] **Step 4: Run a local package build**

Run: `pnpm desktop:pack`
Expected: PASS and produce a macOS desktop artifact.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-03-31-electron-desktop-integration-implementation.md
git commit -m "docs: add electron desktop integration plan"
```

## Self-Review

- Spec coverage:
  - runtime path/data dir: Task 1
  - renderer runtime config: Task 2
  - Electron main/preload/backend host: Task 3
  - build/package flow: Task 4
  - desktop verification: Task 5
- Placeholder scan:
  - no `TODO`/`TBD`; each task names files, commands, and expected verification
- Type consistency:
  - unified names: `resolveOpsClawDataDir`, `resolveDatabaseFilePath`, `buildBackendProcessEnv`, `OpsClawDesktopRuntime`, `buildWorkbenchToolActions`, `buildWorkbenchLayoutActions`
