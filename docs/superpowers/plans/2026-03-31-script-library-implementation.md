# Script Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为工作台增加可维护、可搜索、可执行的脚本库，支持全局脚本、节点脚本覆盖、模板变量填写后执行到当前激活 SSH 会话。

**Architecture:** 后端新增 `script_library` 表、独立 `scriptLibraryStore` 与 HTTP 路由，由服务端负责节点作用域解析与覆盖合并。前端新增脚本领域模型、API 与 `UtilityDrawer` 内的脚本面板，直接复用 `WorkbenchPage -> TerminalWorkspace` 现有终端下发链路执行脚本。

**Tech Stack:** TypeScript, Express, sql.js, React 19, node:test, fetch API

---

### Task 1: Add script storage and resolved list backend

**Files:**
- Modify: `server/database.ts`
- Create: `server/scriptLibraryStore.ts`
- Test: `server/scriptLibraryStore.test.ts`

- [ ] **Step 1: Write the failing store tests**

```ts
void test('listResolvedScripts merges global and node scripts by key', async () => {
  const store = await createScriptLibraryStore();

  store.createScript({
    key: 'restart-nginx',
    scope: 'global',
    nodeId: null,
    title: '重启 Nginx',
    description: '',
    kind: 'plain',
    content: 'sudo systemctl restart nginx',
    variables: [],
    tags: ['ops'],
  });

  store.createScript({
    key: 'restart-nginx',
    scope: 'node',
    nodeId: 'node-1',
    title: '重启 Nginx（node-1）',
    description: '',
    kind: 'plain',
    content: 'sudo service nginx restart',
    variables: [],
    tags: ['ops', 'override'],
  });

  const items = store.listResolvedScripts('node-1');

  assert.equal(items.length, 1);
  assert.equal(items[0]?.resolvedFrom, 'node');
  assert.equal(items[0]?.overridesGlobal, true);
  assert.equal(items[0]?.content, 'sudo service nginx restart');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test server/scriptLibraryStore.test.ts`
Expected: FAIL because `server/scriptLibraryStore.ts` does not exist yet.

- [ ] **Step 3: Implement the table migration and store**

```ts
function ensureScriptLibraryTable(database: SqlDatabaseHandle) {
  database.run(`
    CREATE TABLE IF NOT EXISTS script_library (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('global', 'node')),
      node_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('plain', 'template')),
      content TEXT NOT NULL,
      variables_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(scope, node_id, key)
    );
  `);
}
```

```ts
export function createScriptLibraryStore() {
  return {
    listResolvedScripts(nodeId?: string) { /* merge global + node, node overrides by key */ },
    createScript(input) { /* validate, insert, persist, return record */ },
    updateScript(id, input) { /* validate, update, persist */ },
    deleteScript(id) { /* remove + persist */ },
  };
}
```

- [ ] **Step 4: Run the backend store tests**

Run: `node --import tsx --test server/scriptLibraryStore.test.ts`
Expected: PASS with coverage for create, update, delete, merge, and node override behavior.

- [ ] **Step 5: Commit**

```bash
git add server/database.ts server/scriptLibraryStore.ts server/scriptLibraryStore.test.ts
git commit -m "feat: add script library store"
```

### Task 2: Expose the script library over HTTP

**Files:**
- Modify: `server/http/support.ts`
- Modify: `server/serverApp.ts`
- Modify: `server/httpApi.ts`
- Modify: `server/httpRouteModules.test.ts`
- Modify: `server/httpApi.test.ts`
- Modify: `server/serverApp.test.ts`
- Create: `server/http/scriptRoutes.ts`

- [ ] **Step 1: Write the failing route registration tests**

```ts
assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/scripts'));
assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/scripts'));
assert.ok(routes.some((route) => route.method === 'put' && route.path === '/api/scripts/:id'));
assert.ok(routes.some((route) => route.method === 'delete' && route.path === '/api/scripts/:id'));
```

- [ ] **Step 2: Run route tests to verify they fail**

Run: `node --import tsx --test server/httpRouteModules.test.ts server/httpApi.test.ts`
Expected: FAIL because script routes are not registered.

- [ ] **Step 3: Implement route module and dependency wiring**

```ts
export function registerScriptRoutes(app: HttpRouteApp, { scriptLibraryStore }: HttpApiDependencies) {
  app.get('/api/scripts', (request, response) => {
    const nodeId = typeof request.query['nodeId'] === 'string' ? request.query['nodeId'] : undefined;
    response.json({ items: scriptLibraryStore.listResolvedScripts(nodeId) });
  });

  app.post('/api/scripts', (request, response) => {
    const item = scriptLibraryStore.createScript(parseCreateScriptInput(request.body));
    response.status(201).json({ item });
  });
}
```

```ts
registerOpsClawHttpApi(app, {
  nodeStore,
  commandHistoryStore,
  llmProviderStore,
  scriptLibraryStore,
  fileMemoryStore,
  agentRuntime,
});
```

- [ ] **Step 4: Add an end-to-end HTTP smoke test**

```ts
const createResponse = await fetch(`http://127.0.0.1:${port}/api/scripts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'disk-usage',
    scope: 'global',
    title: '磁盘占用',
    description: '查看磁盘',
    kind: 'plain',
    content: 'df -h',
    variables: [],
    tags: ['inspect'],
  }),
});
assert.equal(createResponse.status, 201);
```

- [ ] **Step 5: Run HTTP tests**

Run: `node --import tsx --test server/httpRouteModules.test.ts server/httpApi.test.ts server/serverApp.test.ts`
Expected: PASS and `/api/scripts` is reachable from the app bootstrap.

- [ ] **Step 6: Commit**

```bash
git add server/http/support.ts server/serverApp.ts server/httpApi.ts server/http/scriptRoutes.ts server/httpRouteModules.test.ts server/httpApi.test.ts server/serverApp.test.ts
git commit -m "feat: add script library api"
```

### Task 3: Add script model and API client with TDD

**Files:**
- Modify: `src/features/workbench/types.ts`
- Modify: `src/features/workbench/api.ts`
- Create: `src/features/workbench/scriptLibraryModel.ts`
- Create: `src/features/workbench/scriptLibraryModel.test.ts`

- [ ] **Step 1: Write the failing frontend model tests**

```ts
void test('renderScriptTemplate replaces placeholders with provided values', () => {
  const output = renderScriptTemplate('systemctl restart ${service}', {
    service: 'nginx',
  });

  assert.equal(output, 'systemctl restart nginx');
});

void test('validateTemplateScript rejects missing required variable values', () => {
  const result = validateScriptVariableValues(
    [{ name: 'service', label: '服务名', inputType: 'text', required: true, defaultValue: '', placeholder: '' }],
    {}
  );

  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run the model tests to verify they fail**

Run: `node --import tsx --test src/features/workbench/scriptLibraryModel.test.ts`
Expected: FAIL because the model file does not exist yet.

- [ ] **Step 3: Implement types, model helpers, and API requests**

```ts
export type ScriptScope = 'global' | 'node';
export type ScriptKind = 'plain' | 'template';

export type ScriptLibraryItem = {
  id: string;
  key: string;
  scope: ScriptScope;
  nodeId: string | null;
  title: string;
  description: string;
  kind: ScriptKind;
  content: string;
  variables: ScriptVariableDefinition[];
  tags: string[];
  resolvedFrom: ScriptScope;
  overridesGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};
```

```ts
export function renderScriptTemplate(content: string, values: Record<string, string>) {
  return content.replaceAll(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, name) => values[name] ?? '');
}
```

- [ ] **Step 4: Run the model tests**

Run: `node --import tsx --test src/features/workbench/scriptLibraryModel.test.ts`
Expected: PASS with template extraction, validation, rendering, and basic filtering behavior.

- [ ] **Step 5: Commit**

```bash
git add src/features/workbench/types.ts src/features/workbench/api.ts src/features/workbench/scriptLibraryModel.ts src/features/workbench/scriptLibraryModel.test.ts
git commit -m "feat: add script library frontend model"
```

### Task 4: Build the script library panel and wire execution into the workbench

**Files:**
- Modify: `src/features/workbench/UtilityDrawer.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`
- Create: `src/features/workbench/ScriptLibraryPanel.tsx`

- [ ] **Step 1: Write the failing interaction test for the pure model surface**

```ts
void test('filterVisibleScripts matches title, key, and tags case-insensitively', () => {
  const items = [{ key: 'restart-nginx', title: '重启 Nginx', tags: ['ops'], kind: 'plain', scope: 'global' }] as ScriptLibraryItem[];
  const result = filterVisibleScripts(items, 'nginx');
  assert.equal(result.length, 1);
});
```

- [ ] **Step 2: Run the model test to verify the filtering gap**

Run: `node --import tsx --test src/features/workbench/scriptLibraryModel.test.ts`
Expected: FAIL until search/filter helper exists.

- [ ] **Step 3: Implement `ScriptLibraryPanel` and integrate `UtilityDrawer`**

```tsx
<UtilityDrawer
  activeNodeId={sessions.find((session) => session.id === activeSessionId)?.nodeId ?? null}
  activeSessionId={activeSessionId}
  onExecuteCommand={(command) => {
    terminalWorkspaceRef.current?.sendCommandToActive(command);
  }}
/>;
```

```tsx
<ScriptLibraryPanel
  activeNodeId={activeNodeId}
  activeSessionId={activeSessionId}
  onExecuteCommand={onExecuteCommand}
/>
```

- [ ] **Step 4: Support create, edit, delete, and execute in-panel**

```tsx
{selectedScript.kind === 'template' ? (
  <form onSubmit={handleExecuteTemplate}>
    {selectedScript.variables.map((variable) => (
      <input key={variable.name} value={draftValues[variable.name] ?? ''} />
    ))}
    <button type="submit">执行到当前会话</button>
  </form>
) : (
  <button onClick={() => onExecuteCommand(selectedScript.content)}>执行到当前会话</button>
)}
```

- [ ] **Step 5: Run targeted frontend verification**

Run: `node --import tsx --test src/features/workbench/scriptLibraryModel.test.ts`
Expected: PASS for template rendering and filtering helpers used by the panel.

- [ ] **Step 6: Commit**

```bash
git add src/features/workbench/UtilityDrawer.tsx src/routes/WorkbenchPage.tsx src/features/workbench/ScriptLibraryPanel.tsx src/features/workbench/scriptLibraryModel.ts src/features/workbench/scriptLibraryModel.test.ts
git commit -m "feat: add script library workbench panel"
```

### Task 5: Final verification

**Files:**
- Verify touched files only

- [ ] **Step 1: Run backend and frontend targeted tests**

Run: `node --import tsx --test server/scriptLibraryStore.test.ts server/httpRouteModules.test.ts server/httpApi.test.ts server/serverApp.test.ts src/features/workbench/scriptLibraryModel.test.ts`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run lint on touched files or full repo if stable**

Run: `pnpm lint`
Expected: PASS or only pre-existing unrelated issues

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-03-31-script-library-implementation.md
git commit -m "docs: add script library implementation plan"
```

## Self-Review

- Spec coverage:
  - 全局脚本、节点脚本、覆盖规则: Task 1, Task 2
  - HTTP CRUD: Task 2
  - 模板渲染与变量校验: Task 3
  - 工作台执行集成与 UI 管理: Task 4
  - 回归验证: Task 5
- Placeholder scan:
  - No `TODO`/`TBD`; every task names exact files, commands, and the expected verification.
- Type consistency:
  - 统一使用 `ScriptLibraryItem`、`ScriptVariableDefinition`、`ScriptScope`、`ScriptKind`、`scriptLibraryStore`、`registerScriptRoutes`。
