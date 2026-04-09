# Script Library Alias And Quick Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OpsClaw 脚本库增加独立 `alias` 字段、高密度列表 UI，以及终端内 `x alias` 快捷补全与执行能力。

**Architecture:** 先在数据库、store、HTTP 和前端共享类型中补齐 `alias` 与分层唯一性，再把脚本库 UI 从大卡片切换为高密度列表。随后新增终端快捷脚本纯函数模型，并在现有终端 suggestion overlay 链路上扩展为脚本候选列表。最后接入 template 本地参数卡片与终端发送链路，完成端到端验证。

**Tech Stack:** TypeScript, React 19, sql.js, Express, node:test via `pnpm exec tsx --test`, xterm.js

---

## File Map

### New Files

- `src/features/workbench/terminalQuickScriptModel.ts`
  - 纯函数：识别 `x ` 快捷模式、提取 query、排序候选、精确命中、构建浮层候选项、300ms 延迟决策。
- `src/features/workbench/terminalQuickScriptModel.test.ts`
  - 覆盖快捷模式识别、节点覆盖优先级、精确命中和未命中行为。
- `src/features/workbench/TerminalQuickScriptDialog.tsx`
  - template 脚本变量输入的本地原生对话框。
- `src/features/workbench/TerminalQuickScriptDialog.test.ts`
  - 覆盖变量表单渲染、校验和提交 payload。

### Existing Files To Modify

- `server/database.ts`
  - 为 `script_library` 增加 `alias` 列与唯一索引迁移。
- `server/scriptLibraryStore.ts`
  - 扩展 `ScriptLibraryItem` / `CreateScriptInput` / `UpdateScriptInput`，增加 alias 校验与分层唯一性检查。
- `server/scriptLibraryStore.test.ts`
  - 增加 alias 校验、迁移与解析优先级测试。
- `server/http/support.ts`
  - 解析 create/update script 请求中的 `alias`。
- `server/http/scriptRoutes.ts`
  - 保持路由不变，返回与接收 alias。
- `server/serverApp.test.ts`
  - 覆盖 HTTP 创建/读取脚本时 alias 字段往返。
- `src/features/workbench/types.ts`
  - 前端共享脚本类型新增 `alias`。
- `src/features/workbench/scriptApi.ts`
  - 继续复用原有 API，但携带 alias 字段。
- `src/features/workbench/scriptLibraryModel.ts`
  - 新增 alias 校验、alias 搜索、列表排序帮助函数。
- `src/features/workbench/scriptLibraryModel.test.ts`
  - 覆盖 alias 搜索、合法性校验与排序。
- `src/features/workbench/ScriptLibraryPanel.tsx`
  - 列表改为高密度列表，编辑弹窗新增 alias 字段，搜索纳入 alias。
- `src/features/workbench/useSshTerminalRuntime.ts`
  - 将当前单字符串历史建议扩展为脚本快捷候选模式。
- `src/features/workbench/SshTerminalPane.tsx`
  - 接入快捷脚本候选列表显示与 template 参数卡片。
- `src/features/workbench/SshTerminalSuggestionOverlay.tsx`
  - 从单字符串建议改为支持多候选与高亮行。
- `src/features/workbench/sshTerminalRuntimeModel.ts`
  - 扩展输入解析，支持在 `x ` 模式下拦截回车 / Esc / 方向键。
- `src/features/workbench/sshTerminalSuggestionOverlayModel.ts`
  - 扩展浮层定位，适配多候选列表高度。
- `src/features/workbench/sshTerminalCommandExecutionModel.test.ts`
  - 保证快捷脚本注入不破坏终端原有执行捕获。

## Task 1: 数据库与 Store 增加 alias 字段及分层唯一性

**Files:**
- Modify: `server/database.ts`
- Modify: `server/scriptLibraryStore.ts`
- Test: `server/scriptLibraryStore.test.ts`

- [ ] **Step 1: 写失败测试，锁定 createScript 返回 alias 且 listResolvedScripts 保留 alias**

```ts
void test('createScript persists alias and listResolvedScripts returns it', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  store.createScript({
    key: 'disk-usage',
    alias: 'disk',
    scope: 'global',
    nodeId: null,
    title: '查看磁盘',
    description: '查看磁盘占用',
    kind: 'plain',
    content: 'df -h',
    variables: [],
    tags: ['ops'],
  });

  const [item] = store.listResolvedScripts();
  assert.equal(item?.alias, 'disk');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec tsx --test server/scriptLibraryStore.test.ts`
Expected: FAIL，提示 `alias` 字段不存在或 create input 类型不匹配。

- [ ] **Step 3: 在脚本库表定义中加入 alias 列和迁移逻辑**

在 `server/database.ts` 中补齐表结构与老库迁移：

```ts
function queryTableColumns(database: SqlDatabaseHandle, tableName: string) {
  const rows = queryMany(
    database,
    `PRAGMA table_info(${tableName})`,
    (row) => readString(row.name, 'name')
  );

  return new Set(rows);
}

function ensureScriptLibraryAliasColumn(database: SqlDatabaseHandle) {
  const columns = queryTableColumns(database, 'script_library');
  if (!columns.has('alias')) {
    database.run(`ALTER TABLE script_library ADD COLUMN alias TEXT NOT NULL DEFAULT '';`);
    database.run(`UPDATE script_library SET alias = key WHERE alias = '';`);
  }

  database.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_script_library_global_alias
    ON script_library(alias)
    WHERE scope = 'global';
  `);
  database.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_script_library_node_alias
    ON script_library(node_id, alias)
    WHERE scope = 'node';
  `);
}
```

- [ ] **Step 4: 扩展 Store 类型与 row 映射**

在 `server/scriptLibraryStore.ts` 中补齐 alias：

```ts
export type ScriptLibraryItem = {
  id: string;
  key: string;
  alias: string;
  scope: ScriptScope;
  nodeId: string | null;
  title: string;
  description: string;
  kind: ScriptKind;
  content: string;
  variables: ScriptVariableDefinition[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

function mapScriptRow(row: SqlRow): ScriptLibraryItem {
  return {
    id: readString(row.id, 'id'),
    key: readString(row.key, 'key'),
    alias: readString(row.alias, 'alias'),
    scope: readScope(row.scope),
    nodeId: readNullableString(row.node_id),
    title: readString(row.title, 'title'),
    description: readString(row.description, 'description'),
    kind: readKind(row.kind),
    content: readString(row.content, 'content'),
    variables: parseJsonArray<unknown>(row.variables_json, 'variables_json').map(normalizeScriptVariable),
    tags: parseJsonArray<unknown>(row.tags_json, 'tags_json').filter(
      (value): value is string => typeof value === 'string'
    ),
    createdAt: readString(row.created_at, 'created_at'),
    updatedAt: readString(row.updated_at, 'updated_at'),
  };
}
```

- [ ] **Step 5: 增加 alias 合法性与唯一性校验**

在 `server/scriptLibraryStore.ts` 中加入：

```ts
const SCRIPT_ALIAS_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function normalizeAlias(value: string) {
  const alias = value.trim();
  if (!alias) {
    throw new Error('脚本 alias 不能为空。');
  }
  if (!SCRIPT_ALIAS_PATTERN.test(alias)) {
    throw new Error('脚本 alias 只能包含小写字母、数字、-、_。');
  }
  return alias;
}

function assertAliasAvailable(
  database: SqlDatabaseHandle,
  input: { alias: string; scope: ScriptScope; nodeId: string | null; excludeId?: string }
) {
  const row = queryOne(
    database,
    `
      SELECT id FROM script_library
      WHERE alias = :alias
        AND (
          (scope = 'global' AND :scope = 'global')
          OR
          (scope = 'node' AND :scope = 'node' AND node_id = :nodeId)
        )
        AND (:excludeId IS NULL OR id != :excludeId)
    `,
    (value) => value,
    {
      ':alias': input.alias,
      ':scope': input.scope,
      ':nodeId': input.nodeId,
      ':excludeId': input.excludeId ?? null,
    }
  );

  if (row) {
    throw new Error('脚本 alias 已存在。');
  }
}
```

- [ ] **Step 6: 扩展 create/update SQL**

在 `server/scriptLibraryStore.ts` 的 insert / update 语句中加入 alias：

```ts
INSERT INTO script_library (
  id, key, alias, scope, node_id, title, description, kind, content,
  variables_json, tags_json, created_at, updated_at
) VALUES (
  :id, :key, :alias, :scope, :nodeId, :title, :description, :kind, :content,
  :variablesJson, :tagsJson, :createdAt, :updatedAt
);
```

```ts
UPDATE script_library
SET
  key = :key,
  alias = :alias,
  title = :title,
  description = :description,
  kind = :kind,
  content = :content,
  variables_json = :variablesJson,
  tags_json = :tagsJson,
  updated_at = :updatedAt
WHERE id = :id
```

- [ ] **Step 7: 增加节点覆盖全局 alias 的测试**

把以下测试加入 `server/scriptLibraryStore.test.ts`：

```ts
void test('node alias overrides global alias during resolved lookup', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  store.createScript({
    key: 'restart-global',
    alias: 'restart',
    scope: 'global',
    nodeId: null,
    title: '全局重启',
    description: '',
    kind: 'plain',
    content: 'systemctl restart nginx',
    variables: [],
    tags: [],
  });

  store.createScript({
    key: 'restart-node',
    alias: 'restart',
    scope: 'node',
    nodeId: 'node-1',
    title: '节点重启',
    description: '',
    kind: 'plain',
    content: 'service nginx restart',
    variables: [],
    tags: [],
  });

  const [resolved] = store.listResolvedScripts('node-1').filter((item) => item.alias === 'restart');
  assert.equal(resolved?.resolvedFrom, 'node');
  assert.equal(resolved?.content, 'service nginx restart');
});
```

- [ ] **Step 8: 运行测试确认通过**

Run: `pnpm exec tsx --test server/scriptLibraryStore.test.ts`
Expected: PASS，新增 alias 与优先级测试全部通过。

- [ ] **Step 9: Commit**

```bash
git add server/database.ts server/scriptLibraryStore.ts server/scriptLibraryStore.test.ts
git commit -m "feat: add script aliases to script library store"
```

## Task 2: HTTP 与前端共享类型支持 alias 往返

**Files:**
- Modify: `server/http/support.ts`
- Modify: `server/http/scriptRoutes.ts`
- Modify: `server/serverApp.test.ts`
- Modify: `src/features/workbench/types.ts`
- Modify: `src/features/workbench/scriptApi.ts`

- [ ] **Step 1: 写失败测试，锁定 `/api/scripts` create/list 往返 alias**

在 `server/serverApp.test.ts` 中加入：

```ts
void test('script routes round-trip alias for create and list', async () => {
  const app = await createTestServerApp();
  const port = await startTestServer(app);

  const createResponse = await fetch(`http://127.0.0.1:${port}/api/scripts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'disk-usage',
      alias: 'disk',
      scope: 'global',
      nodeId: null,
      title: '查看磁盘',
      description: '',
      kind: 'plain',
      content: 'df -h',
      variables: [],
      tags: [],
    }),
  });

  assert.equal(createResponse.status, 201);
  const createdPayload = (await createResponse.json()) as { item: { alias: string } };
  assert.equal(createdPayload.item.alias, 'disk');

  const listResponse = await fetch(`http://127.0.0.1:${port}/api/scripts`);
  const listPayload = (await listResponse.json()) as { items: Array<{ alias: string }> };
  assert.equal(listPayload.items[0]?.alias, 'disk');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec tsx --test server/serverApp.test.ts`
Expected: FAIL，提示 create payload 缺少 alias 或返回项没有 alias。

- [ ] **Step 3: 在 HTTP 解析层加入 alias**

在 `server/http/support.ts` 的脚本解析函数中加入：

```ts
export function parseCreateScriptInput(payload: unknown): CreateScriptInput {
  if (!isRecord(payload)) {
    throw new RequestError(400, '脚本格式错误。');
  }

  return {
    key: readRequiredString(payload, 'key', '脚本 Key'),
    alias: readRequiredString(payload, 'alias', '脚本别名'),
    scope: readScriptScope(payload),
    nodeId: readOptionalString(payload, 'nodeId') ?? null,
    title: readRequiredString(payload, 'title', '脚本标题'),
    description: readOptionalString(payload, 'description') ?? '',
    kind: readScriptKind(payload),
    content: readRequiredString(payload, 'content', '脚本内容'),
    variables: readScriptVariables(payload),
    tags: readScriptTags(payload),
  };
}
```

- [ ] **Step 4: 扩展前端共享类型与 API**

在 `src/features/workbench/types.ts` 中补齐：

```ts
export type ScriptLibraryItem = {
  id: string;
  key: string;
  alias: string;
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

export type ScriptLibraryUpsertInput = {
  key: string;
  alias: string;
  scope: ScriptScope;
  nodeId: string | null;
  title: string;
  description: string;
  kind: ScriptKind;
  content: string;
  variables: ScriptVariableDefinition[];
  tags: string[];
};
```

- [ ] **Step 5: 运行接口测试确认通过**

Run: `pnpm exec tsx --test server/serverApp.test.ts`
Expected: PASS，脚本 HTTP 创建与读取均携带 alias。

- [ ] **Step 6: Commit**

```bash
git add server/http/support.ts server/http/scriptRoutes.ts server/serverApp.test.ts src/features/workbench/types.ts src/features/workbench/scriptApi.ts
git commit -m "feat: expose script aliases through http api"
```

## Task 3: 脚本库模型与高密度列表 UI

**Files:**
- Modify: `src/features/workbench/scriptLibraryModel.ts`
- Modify: `src/features/workbench/scriptLibraryModel.test.ts`
- Modify: `src/features/workbench/ScriptLibraryPanel.tsx`

- [ ] **Step 1: 写失败测试，锁定搜索可以命中 alias**

在 `src/features/workbench/scriptLibraryModel.test.ts` 中加入：

```ts
void test('filterScriptLibraryItems matches alias before title and tags', () => {
  const items: ScriptLibraryItem[] = [
    {
      id: 'script-1',
      key: 'restart-nginx',
      alias: 'nginx',
      scope: 'global',
      nodeId: null,
      title: '重启 Nginx',
      description: '重启服务',
      kind: 'plain',
      content: 'systemctl restart nginx',
      variables: [],
      tags: ['ops'],
      resolvedFrom: 'global',
      overridesGlobal: false,
      createdAt: '',
      updatedAt: '',
    },
  ];

  assert.equal(filterScriptLibraryItems(items, 'nginx').length, 1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec tsx --test src/features/workbench/scriptLibraryModel.test.ts`
Expected: FAIL，说明当前过滤逻辑未纳入 alias。

- [ ] **Step 3: 在模型层加入 alias 校验与搜索**

在 `src/features/workbench/scriptLibraryModel.ts` 中加入：

```ts
export const SCRIPT_ALIAS_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function validateScriptAlias(alias: string) {
  const normalized = alias.trim();
  if (!normalized) {
    return { ok: false as const, message: '脚本别名不能为空。' };
  }
  if (!SCRIPT_ALIAS_PATTERN.test(normalized)) {
    return { ok: false as const, message: '脚本别名只能包含小写字母、数字、-、_。' };
  }
  return { ok: true as const, message: null };
}

export function filterScriptLibraryItems(items: ScriptLibraryItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const haystacks = [item.alias, item.title, item.key, item.description, ...item.tags];
    return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}
```

- [ ] **Step 4: 将脚本编辑草稿扩展 alias**

在 `src/features/workbench/ScriptLibraryPanel.tsx` 中把空草稿与 upsert payload 改成：

```ts
function createEmptyScriptDraft(activeNodeId: string | null): ScriptLibraryUpsertInput {
  return {
    key: '',
    alias: '',
    scope: activeNodeId ? 'node' : 'global',
    nodeId: activeNodeId,
    title: '',
    description: '',
    kind: 'plain',
    content: '',
    variables: [],
    tags: [],
  };
}
```

```ts
function buildUpsertInput(editorState: EditorState, activeNodeId: string | null): ScriptLibraryUpsertInput {
  return {
    key: editorState.draft.key.trim(),
    alias: editorState.draft.alias.trim(),
    scope: editorState.draft.scope,
    nodeId: editorState.draft.scope === 'node' ? activeNodeId : null,
    title: editorState.draft.title.trim(),
    description: editorState.draft.description.trim(),
    kind: editorState.draft.kind,
    content: editorState.draft.content,
    variables: editorState.draft.variables,
    tags: parseTags(editorState.tagsText),
  };
}
```

- [ ] **Step 5: 把脚本列表从卡片改成高密度行列表**

在 `src/features/workbench/ScriptLibraryPanel.tsx` 中将列表项改为行布局：

```tsx
<div className="overflow-y-auto border-b border-[var(--app-border-default)]">
  <div className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)_90px_90px] gap-3 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
    <span>Alias</span>
    <span>标题</span>
    <span>作用域</span>
    <span>类型</span>
  </div>
  <div className="divide-y divide-neutral-900/80">
    {filteredItems.map((item) => {
      const selected = item.id === selectedScript?.id;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            setExecuteError(null);
            setSelectedScriptId(item.id);
          }}
          className={cn(
            'grid w-full grid-cols-[minmax(0,120px)_minmax(0,1fr)_90px_90px] gap-3 px-3 py-2.5 text-left transition-colors',
            selected
              ? 'bg-blue-500/10 text-neutral-100'
              : 'hover:bg-neutral-900/60 text-neutral-300'
          )}
        >
          <span className="truncate font-mono text-[12px] text-blue-300">{item.alias}</span>
          <span className="truncate text-sm">{item.title}</span>
          <span className="text-xs text-neutral-400">{getScriptScopeLabel(item)}</span>
          <span className="text-xs text-neutral-400">{item.kind}</span>
        </button>
      );
    })}
  </div>
</div>
```

- [ ] **Step 6: 在编辑弹窗里新增 alias 输入项**

在 `src/features/workbench/ScriptLibraryPanel.tsx` 的编辑对话框中插入：

```tsx
<div className="grid gap-2">
  <Label htmlFor="script-alias">脚本别名</Label>
  <Input
    id="script-alias"
    value={state.draft.alias}
    onChange={(event) =>
      onStateChange({
        ...state,
        draft: {
          ...state.draft,
          alias: event.target.value,
        },
      })
    }
    placeholder="例如 nginx-restart"
  />
  <p className="text-xs text-neutral-500">终端中输入 x {state.draft.alias || '<alias>'} 可快捷执行。</p>
</div>
```

- [ ] **Step 7: 运行前端模型测试确认通过**

Run: `pnpm exec tsx --test src/features/workbench/scriptLibraryModel.test.ts`
Expected: PASS，alias 搜索与校验测试通过。

- [ ] **Step 8: Commit**

```bash
git add src/features/workbench/scriptLibraryModel.ts src/features/workbench/scriptLibraryModel.test.ts src/features/workbench/ScriptLibraryPanel.tsx
git commit -m "feat: add dense script library list with aliases"
```

## Task 4: 建立终端快捷脚本纯函数模型

**Files:**
- Create: `src/features/workbench/terminalQuickScriptModel.ts`
- Create: `src/features/workbench/terminalQuickScriptModel.test.ts`
- Modify: `src/features/workbench/types.ts`

- [ ] **Step 1: 写失败测试，锁定只有整行开头 `x ` 才进入快捷模式**

创建 `src/features/workbench/terminalQuickScriptModel.test.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectTerminalQuickScriptQuery,
  findExactQuickScriptMatch,
} from './terminalQuickScriptModel.js';

void test('detectTerminalQuickScriptQuery only matches whole-line x prefix', () => {
  assert.equal(detectTerminalQuickScriptQuery('x nginx'), 'nginx');
  assert.equal(detectTerminalQuickScriptQuery('x '), '');
  assert.equal(detectTerminalQuickScriptQuery('echo x nginx'), null);
  assert.equal(detectTerminalQuickScriptQuery('sudo x nginx'), null);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec tsx --test src/features/workbench/terminalQuickScriptModel.test.ts`
Expected: FAIL，提示文件或函数不存在。

- [ ] **Step 3: 实现快捷模式检测与候选排序**

创建 `src/features/workbench/terminalQuickScriptModel.ts`：

```ts
import type { ScriptLibraryItem } from './types.js';

export const TERMINAL_QUICK_SCRIPT_PREFIX = 'x ';
export const TERMINAL_QUICK_SCRIPT_DELAY_MS = 300;

export function detectTerminalQuickScriptQuery(input: string) {
  if (!input.startsWith(TERMINAL_QUICK_SCRIPT_PREFIX)) {
    return null;
  }

  return input.slice(TERMINAL_QUICK_SCRIPT_PREFIX.length);
}

export function rankQuickScriptCandidates(items: ScriptLibraryItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  const ranked = items.filter((item) => {
    if (!normalized) {
      return true;
    }
    return [item.alias, item.title, ...item.tags].some((value) =>
      value.toLowerCase().includes(normalized)
    );
  });

  return ranked.sort((left, right) => {
    const leftAliasExact = left.alias.toLowerCase() === normalized ? 0 : 1;
    const rightAliasExact = right.alias.toLowerCase() === normalized ? 0 : 1;
    if (leftAliasExact !== rightAliasExact) {
      return leftAliasExact - rightAliasExact;
    }
    if (left.resolvedFrom !== right.resolvedFrom) {
      return left.resolvedFrom === 'node' ? -1 : 1;
    }
    return left.alias.localeCompare(right.alias);
  });
}

export function findExactQuickScriptMatch(items: ScriptLibraryItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  return rankQuickScriptCandidates(items, normalized).find(
    (item) => item.alias.toLowerCase() === normalized
  ) ?? null;
}
```

- [ ] **Step 4: 增加节点优先与精确匹配测试**

向 `src/features/workbench/terminalQuickScriptModel.test.ts` 追加：

```ts
void test('findExactQuickScriptMatch prefers node script over global script', () => {
  const items = [
    {
      id: 'global-1',
      key: 'restart-global',
      alias: 'restart',
      scope: 'global',
      nodeId: null,
      title: '全局重启',
      description: '',
      kind: 'plain',
      content: 'systemctl restart nginx',
      variables: [],
      tags: [],
      resolvedFrom: 'global',
      overridesGlobal: false,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'node-1',
      key: 'restart-node',
      alias: 'restart',
      scope: 'node',
      nodeId: 'node-1',
      title: '节点重启',
      description: '',
      kind: 'plain',
      content: 'service nginx restart',
      variables: [],
      tags: [],
      resolvedFrom: 'node',
      overridesGlobal: true,
      createdAt: '',
      updatedAt: '',
    },
  ];

  assert.equal(findExactQuickScriptMatch(items, 'restart')?.id, 'node-1');
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm exec tsx --test src/features/workbench/terminalQuickScriptModel.test.ts`
Expected: PASS，快捷模式与优先级测试通过。

- [ ] **Step 6: Commit**

```bash
git add src/features/workbench/terminalQuickScriptModel.ts src/features/workbench/terminalQuickScriptModel.test.ts src/features/workbench/types.ts
git commit -m "feat: add terminal quick script model"
```

## Task 5: 升级终端 suggestion overlay 为脚本候选列表

**Files:**
- Modify: `src/features/workbench/SshTerminalSuggestionOverlay.tsx`
- Modify: `src/features/workbench/sshTerminalSuggestionOverlayModel.ts`
- Modify: `src/features/workbench/sshTerminalRuntimeModel.ts`
- Modify: `src/features/workbench/useSshTerminalRuntime.ts`
- Modify: `src/features/workbench/SshTerminalPane.tsx`
- Modify: `src/features/workbench/terminalQuickScriptModel.ts`
- Modify: `src/features/workbench/terminalQuickScriptModel.test.ts`

- [ ] **Step 1: 写失败测试，锁定脚本候选列表需要多条 overlay item**

在 `src/features/workbench/terminalQuickScriptModel.test.ts` 中加入：

```ts
void test('buildQuickScriptSuggestionItems returns highlighted list items', () => {
  const items = buildQuickScriptSuggestionItems(
    [
      {
        id: 'node-1',
        key: 'restart-node',
        alias: 'restart',
        scope: 'node',
        nodeId: 'node-1',
        title: '节点重启',
        description: '',
        kind: 'plain',
        content: 'service nginx restart',
        variables: [],
        tags: [],
        resolvedFrom: 'node',
        overridesGlobal: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'global-1',
        key: 'logs-global',
        alias: 'logs',
        scope: 'global',
        nodeId: null,
        title: '查看日志',
        description: '',
        kind: 'plain',
        content: 'journalctl -n 200',
        variables: [],
        tags: [],
        resolvedFrom: 'global',
        overridesGlobal: false,
        createdAt: '',
        updatedAt: '',
      },
    ],
    0
  );

  assert.equal(items.length, 2);
  assert.equal(items[0]?.highlighted, true);
  assert.equal(items[0]?.label, 'restart');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec tsx --test src/features/workbench/terminalQuickScriptModel.test.ts`
Expected: FAIL，提示 `buildQuickScriptSuggestionItems` 不存在。

- [ ] **Step 3: 在快捷脚本模型中新增 overlay item 构造器**

在 `src/features/workbench/terminalQuickScriptModel.ts` 中加入：

```ts
export type TerminalQuickScriptSuggestionItem = {
  id: string;
  label: string;
  detail: string;
  highlighted: boolean;
};

export function buildQuickScriptSuggestionItems(
  items: ScriptLibraryItem[],
  selectedIndex: number
) {
  return items.map((item, index) => ({
    id: item.id,
    label: item.alias,
    detail: `${item.title} · ${item.resolvedFrom} · ${item.kind}`,
    highlighted: index === selectedIndex,
  }));
}
```

- [ ] **Step 4: 扩展 suggestion overlay 数据结构**

把 `src/features/workbench/SshTerminalSuggestionOverlay.tsx` 改为支持多候选：

```tsx
type TerminalSuggestionItem = {
  id: string;
  label: string;
  detail: string;
  highlighted: boolean;
};

type SshTerminalSuggestionOverlayProps = {
  placement: SshTerminalSuggestionOverlayPlacement;
  items: TerminalSuggestionItem[];
  title: string;
  top: number;
};
```

```tsx
<div className="space-y-1">
  <div className="flex items-center justify-between text-[11px] text-neutral-500">
    <span>{title}</span>
    <span>Enter 执行 · Esc 关闭</span>
  </div>
  {items.map((item) => (
    <div
      key={item.id}
      className={cn(
        'grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3 rounded-md px-2 py-1.5 text-[12px]',
        item.highlighted ? 'bg-blue-500/15 text-neutral-100' : 'text-neutral-300'
      )}
    >
      <span className="truncate font-mono text-blue-300">{item.label}</span>
      <span className="truncate text-neutral-400">{item.detail}</span>
    </div>
  ))}
</div>
```

- [ ] **Step 5: 在 runtime 中增加脚本候选状态**

在 `src/features/workbench/useSshTerminalRuntime.ts` 中新增：

```ts
const [quickScriptItems, setQuickScriptItems] = useState<TerminalSuggestionItem[]>([]);
const [quickScriptVisible, setQuickScriptVisible] = useState(false);
const [quickScriptSelectedIndex, setQuickScriptSelectedIndex] = useState(0);
const quickScriptSelectedIndexRef = useRef(0);
const rankedQuickScriptsRef = useRef<ScriptLibraryItem[]>([]);
```

并保留历史命令 suggestion 作为另一条路径，不在本任务中删除。

- [ ] **Step 6: 在 `SshTerminalPane.tsx` 中按模式渲染浮层**

加入：

```tsx
{quickScriptVisible && quickScriptItems.length > 0 ? (
  <SshTerminalSuggestionOverlay
    ref={suggestionOverlayRef}
    placement={suggestionOverlayPosition.placement}
    top={suggestionOverlayPosition.top}
    title="快捷脚本"
    items={quickScriptItems}
  />
) : suggestionVisible && suggestion ? (
  <SshTerminalSuggestionOverlay
    ref={suggestionOverlayRef}
    placement={suggestionOverlayPosition.placement}
    top={suggestionOverlayPosition.top}
    title="命令建议"
    items={[
      {
        id: 'history-suggestion',
        label: suggestion,
        detail: '按 Tab 接受',
        highlighted: true,
      },
    ]}
  />
) : null}
```

- [ ] **Step 7: 运行类型检查与终端相关测试**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/features/workbench/SshTerminalSuggestionOverlay.tsx src/features/workbench/sshTerminalSuggestionOverlayModel.ts src/features/workbench/sshTerminalRuntimeModel.ts src/features/workbench/useSshTerminalRuntime.ts src/features/workbench/SshTerminalPane.tsx
git commit -m "feat: upgrade terminal suggestion overlay for quick scripts"
```

## Task 6: 终端集成 `x alias` 快捷执行与 template 参数卡片

**Files:**
- Create: `src/features/workbench/TerminalQuickScriptDialog.tsx`
- Create: `src/features/workbench/TerminalQuickScriptDialog.test.ts`
- Modify: `src/features/workbench/useSshTerminalRuntime.ts`
- Modify: `src/features/workbench/SshTerminalPane.tsx`
- Modify: `src/features/workbench/scriptLibraryModel.ts`
- Modify: `src/features/workbench/scriptApi.ts`

- [ ] **Step 1: 写失败测试，锁定 template 快捷脚本需要本地参数卡片**

创建 `src/features/workbench/TerminalQuickScriptDialog.test.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScriptVariableInitialValues,
  renderScriptTemplate,
  validateScriptVariableValues,
} from './scriptLibraryModel.js';

void test('template quick script requires variables before rendering final command', () => {
  const variables = [
    {
      name: 'service',
      label: '服务名',
      inputType: 'text' as const,
      required: true,
      defaultValue: 'nginx',
      placeholder: '',
    },
  ];

  const values = buildScriptVariableInitialValues(variables);
  const validation = validateScriptVariableValues(variables, values);
  assert.equal(validation.ok, true);
  assert.equal(renderScriptTemplate('systemctl restart ${service}', values), 'systemctl restart nginx');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec tsx --test src/features/workbench/TerminalQuickScriptDialog.test.ts`
Expected: FAIL，说明 dialog 还不存在或集成未完成。

- [ ] **Step 3: 实现本地 template 参数卡片**

创建 `src/features/workbench/TerminalQuickScriptDialog.tsx`：

```tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { ScriptLibraryItem } from './types';

type TerminalQuickScriptDialogProps = {
  open: boolean;
  script: ScriptLibraryItem | null;
  values: Record<string, string>;
  errorMessage: string | null;
  onChange: (name: string, value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};
```

并按 `script.variables` 渲染输入框，底部提供“执行脚本”和“取消”按钮。

- [ ] **Step 4: 在终端 pane 内加载当前 session 可见脚本**

在 `src/features/workbench/SshTerminalPane.tsx` 中加入本地脚本状态：

```ts
const [quickScripts, setQuickScripts] = useState<ScriptLibraryItem[]>([]);
const [quickScriptsError, setQuickScriptsError] = useState<string | null>(null);
```

并新增 effect，按当前 session.nodeId 拉取可见脚本：

```ts
useEffect(() => {
  let cancelled = false;

  void fetchScripts(session.nodeId ?? null)
    .then((items) => {
      if (!cancelled) {
        setQuickScripts(items);
        setQuickScriptsError(null);
      }
    })
    .catch((error) => {
      if (!cancelled) {
        setQuickScripts([]);
        setQuickScriptsError(error instanceof Error ? error.message : '快捷脚本加载失败。');
      }
    });

  return () => {
    cancelled = true;
  };
}, [session.nodeId]);
```

- [ ] **Step 5: 在 runtime 中接入快捷模式的回车分流**

在 `src/features/workbench/useSshTerminalRuntime.ts` 中新增参数：

```ts
type UseSshTerminalRuntimeOptions = {
  ...
  quickScriptsRef: MutableRefObject<ScriptLibraryItem[]>;
  onExecuteQuickScript: (item: ScriptLibraryItem) => void;
  onQuickScriptNotFound: (query: string) => void;
};
```

并在回车处理分支中写成：

```ts
const quickQuery = detectTerminalQuickScriptQuery(inputBufferRef.current);
if (quickQuery !== null && resolution.commandToRecord) {
  const exactMatch = findExactQuickScriptMatch(quickScriptsRef.current, quickQuery);
  const selectedMatch = rankedQuickScriptsRef.current[quickScriptSelectedIndexRef.current] ?? null;
  const target = selectedMatch ?? exactMatch;

  if (target) {
    onExecuteQuickScript(target);
  } else {
    onQuickScriptNotFound(quickQuery);
  }

  inputBufferRef.current = '';
  setQuickScriptVisible(false);
  setQuickScriptItems([]);
  return;
}
```

其中：

- plain -> 直接通过 websocket 发送 `content + '\n'`
- template -> 打开 `TerminalQuickScriptDialog`

- [ ] **Step 6: 在 `SshTerminalPane.tsx` 里处理 dialog 提交**

增加本地状态：

```ts
const [activeQuickScript, setActiveQuickScript] = useState<ScriptLibraryItem | null>(null);
const [quickScriptVariableValues, setQuickScriptVariableValues] = useState<Record<string, string>>({});
const [quickScriptError, setQuickScriptError] = useState<string | null>(null);
const quickScriptsRef = useRef<ScriptLibraryItem[]>([]);
```

提交时：

```ts
const validation = validateScriptVariableValues(activeQuickScript.variables, quickScriptVariableValues);
if (!validation.ok) {
  setQuickScriptError(validation.message);
  return;
}

controllerHandle.sendCommand(
  renderScriptTemplate(activeQuickScript.content, quickScriptVariableValues)
);
setActiveQuickScript(null);
setQuickScriptError(null);
```

plain 脚本的执行入口写成：

```ts
function handleExecuteQuickScript(script: ScriptLibraryItem) {
  if (script.kind === 'plain') {
    controllerHandle.sendCommand(script.content);
    return;
  }

  setQuickScriptVariableValues(buildScriptVariableInitialValues(script.variables));
  setQuickScriptError(null);
  setActiveQuickScript(script);
}
```

- [ ] **Step 7: 运行测试与类型检查**

Run: `pnpm typecheck`
Expected: PASS。

Run: `pnpm exec tsx --test src/features/workbench/terminalQuickScriptModel.test.ts src/features/workbench/TerminalQuickScriptDialog.test.ts src/features/workbench/scriptLibraryModel.test.ts`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/features/workbench/TerminalQuickScriptDialog.tsx src/features/workbench/TerminalQuickScriptDialog.test.ts src/features/workbench/useSshTerminalRuntime.ts src/features/workbench/SshTerminalPane.tsx src/features/workbench/scriptLibraryModel.ts src/features/workbench/scriptApi.ts
git commit -m "feat: execute script aliases from terminal"
```

## Task 7: 端到端回归与文档收尾

**Files:**
- Modify: `src/features/workbench/helpDialogModel.ts`
- Modify: `src/features/workbench/helpDialogModel.test.ts`
- Modify: `docs/superpowers/specs/2026-04-08-script-library-alias-and-quick-run-design.md`

- [ ] **Step 1: 更新帮助文案，加入 `x alias` 用法**

在 `src/features/workbench/helpDialogModel.ts` 中补充：

```ts
'脚本支持 alias，终端中输入 x alias 并回车，可快速执行对应脚本。',
```

以及脚本库能力 bullet：

```ts
'脚本库：沉淀全局脚本、节点覆盖脚本和脚本别名（alias）。'
```

- [ ] **Step 2: 更新帮助文案测试**

在 `src/features/workbench/helpDialogModel.test.ts` 中加入：

```ts
assert.ok(content.coreFeatures.includes('脚本库：沉淀全局脚本、节点覆盖脚本和脚本别名（alias）。'));
assert.ok(content.usageTips.includes('脚本支持 alias，终端中输入 x alias 并回车，可快速执行对应脚本。'));
```

- [ ] **Step 3: 运行最终验证**

Run: `pnpm typecheck`
Expected: PASS。

Run: `pnpm exec tsx --test server/scriptLibraryStore.test.ts server/serverApp.test.ts src/features/workbench/scriptLibraryModel.test.ts src/features/workbench/terminalQuickScriptModel.test.ts src/features/workbench/TerminalQuickScriptDialog.test.ts src/features/workbench/helpDialogModel.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/features/workbench/helpDialogModel.ts src/features/workbench/helpDialogModel.test.ts docs/superpowers/specs/2026-04-08-script-library-alias-and-quick-run-design.md
git commit -m "docs: add quick script alias guidance"
```

## Self-Review

- Spec coverage:
  - alias 字段与分层唯一性：Task 1、Task 2
  - 脚本库高密度列表：Task 3
  - `x alias` 快捷模式与 300ms 延迟：Task 4、Task 5、Task 6
  - `plain` / `template` 分流：Task 6
  - 本地参数卡片与不接入 agent interaction 协议：Task 6
  - 帮助文案与回归验证：Task 7
- Placeholder scan:
  - 已避免 `TODO/TBD` 与“自行补充”式步骤，每个任务都指定了文件、测试和命令。
- Type consistency:
  - `alias` 在 store、HTTP、前端共享类型、终端快捷模型中使用统一字段名。
  - 快捷脚本前缀统一使用 `x `。
  - template 脚本变量继续复用现有 `ScriptVariableDefinition` 与 `renderScriptTemplate`。
