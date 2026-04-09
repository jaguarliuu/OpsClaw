# Script Settings Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把脚本管理能力从工作台顶部/右侧抽屉收拢到设置页一级 `脚本` tab，并保留终端 `x alias` 执行链路不变。

**Architecture:** 先补一条“设置页脚本管理”专用数据视角，让设置页可以管理全局脚本和节点脚本，而不是依赖当前会话的 resolved 视图。随后新增设置页 `脚本` tab 和左侧底栏“脚本”入口，最后移除工作台顶部脚本按钮、右侧脚本抽屉、相关快捷键和旧设置侧板，让工作台右侧区域只保留 AI。

**Tech Stack:** TypeScript, React 19, React Router, Express, sql.js, node:test via `pnpm exec tsx --test`

---

## File Map

### New Files

- `src/features/workbench/scriptSettingsModel.ts`
  - 设置页脚本管理的纯函数：scope / node 过滤参数、空状态文案、顶部说明文案。
- `src/features/workbench/scriptSettingsModel.test.ts`
  - 覆盖设置页脚本过滤参数与文案模型。
- `src/features/workbench/ScriptSettingsTab.tsx`
  - 设置页一级 `脚本` tab，承接脚本列表、搜索、创建、编辑与删除。

### Existing Files To Modify

- `server/scriptLibraryStore.ts`
  - 增加“管理视图”查询能力，返回原始脚本记录而不是 resolved 结果。
- `server/scriptLibraryStore.test.ts`
  - 覆盖管理视图对全局 / 节点脚本的返回行为。
- `server/http/scriptRoutes.ts`
  - 暴露脚本管理查询接口。
- `server/serverApp.test.ts`
  - 覆盖脚本管理接口的往返。
- `src/features/workbench/scriptApi.ts`
  - 新增设置页脚本管理 API。
- `src/features/workbench/settingsNavigation.ts`
  - 新增 `scripts` tab。
- `src/features/workbench/settingsNavigation.test.ts`
  - 覆盖 `scripts` 路由解析与构建。
- `src/routes/settingsLazyTabs.tsx`
  - 懒加载 `ScriptSettingsTab`。
- `src/routes/SettingsPage.tsx`
  - 新增 `脚本` 一级 tab，并更新设置页说明文案。
- `src/features/workbench/sessionTreeChromeModel.ts`
  - 左侧底栏动作新增 `open-scripts`。
- `src/features/workbench/sessionTreeChromeModel.test.ts`
  - 覆盖底栏动作顺序。
- `src/features/workbench/SessionTreeFooter.tsx`
  - 接收 `onOpenScripts`，将“脚本”放到底栏。
- `src/features/workbench/SessionTree.tsx`
  - 透传 `onOpenScripts`。
- `src/routes/WorkbenchPage.tsx`
  - 左侧底栏“脚本/设置”统一走设置页路由；移除脚本抽屉和旧设置侧板。
- `src/features/workbench/useWorkbenchShellState.ts`
  - 移除 `isUtilityDrawerOpen` 和 `isSettingsPanelOpen` 相关状态。
- `src/features/workbench/TerminalWorkspace.tsx`
  - 头部不再接收脚本抽屉状态和切换回调。
- `src/features/workbench/TerminalWorkspaceHeader.tsx`
  - 顶部仅保留 Help / AI。
- `src/features/workbench/workbenchHeaderActionsModel.ts`
  - 移除 `utilityDrawer` 顶部动作。
- `src/features/workbench/workbenchHeaderActionsModel.test.ts`
  - 更新顶部动作断言。
- `src/features/workbench/workbenchShortcutModel.ts`
  - 移除 `toggleUtilityDrawer`。
- `src/features/workbench/workbenchShortcutModel.test.ts`
  - 更新快捷键映射断言。
- `src/features/workbench/useKeyboardShortcuts.ts`
  - 删除脚本抽屉快捷键 handler。
- `src/features/workbench/helpDialogModel.ts`
  - Help 删除“打开脚本库”快捷键说明，保留 `x alias` 指引。
- `src/features/workbench/helpDialogModel.test.ts`
  - 更新 Help 内容断言。
- `src/features/workbench/ScriptLibraryPanel.tsx`
  - 删除或清空旧抽屉实现，避免保留死代码。
- `src/features/workbench/UtilityDrawer.tsx`
  - 删除旧脚本抽屉组件。
- `src/features/workbench/utilityDrawerModel.ts`
  - 删除旧抽屉布局模型。
- `src/features/workbench/utilityDrawerModel.test.ts`
  - 删除旧抽屉测试。
- `src/features/workbench/TerminalSettingsPanel.tsx`
  - 删除旧设置侧板。
- `src/features/workbench/workbenchLazyPanels.tsx`
  - 删除 `LazyTerminalSettingsPanel`。

## Task 1: 为设置页补齐脚本“管理视图”接口

**Files:**
- Modify: `server/scriptLibraryStore.ts`
- Modify: `server/scriptLibraryStore.test.ts`
- Modify: `server/http/scriptRoutes.ts`
- Modify: `server/serverApp.test.ts`
- Modify: `src/features/workbench/scriptApi.ts`

- [ ] **Step 1: 写失败测试，锁定 store 能返回原始脚本记录而不是 resolved 视图**

在 `server/scriptLibraryStore.test.ts` 中加入：

```ts
void test('listManagedScripts returns global and node scripts without resolved merging', async () => {
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

  const items = store.listManagedScripts();

  assert.equal(items.length, 2);
  assert.equal(items.some((item) => item.scope === 'global' && item.alias === 'restart'), true);
  assert.equal(items.some((item) => item.scope === 'node' && item.nodeId === 'node-1'), true);
});
```

- [ ] **Step 2: 写失败测试，锁定 HTTP 管理接口会返回节点脚本**

在 `server/serverApp.test.ts` 中加入：

```ts
void test('script management route returns raw node scripts for settings page', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);

  try {
    await fetch(`http://127.0.0.1:${port}/api/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'restart-node-manage',
        alias: 'restart-node-manage',
        scope: 'node',
        nodeId: 'node-1',
        title: '节点脚本',
        description: '',
        kind: 'plain',
        content: 'echo node',
        variables: [],
        tags: [],
      }),
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/scripts/manage?scope=node&nodeId=node-1`);
    const payload = (await response.json()) as { items: Array<{ scope: string; nodeId: string | null }> };

    assert.equal(response.status, 200);
    assert.deepEqual(payload.items, [
      {
        scope: 'node',
        nodeId: 'node-1',
      },
    ]);
  } finally {
    await close(runtime.server);
  }
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm exec tsx --test server/scriptLibraryStore.test.ts server/serverApp.test.ts`
Expected: FAIL，提示 `listManagedScripts` 或 `/api/scripts/manage` 尚不存在。

- [ ] **Step 4: 在 store 中实现脚本管理查询**

在 `server/scriptLibraryStore.ts` 中增加：

```ts
function listManagedScripts(input?: { scope?: 'global' | 'node'; nodeId?: string }) {
  if (input?.scope === 'node') {
    return queryMany(
      database,
      `
        SELECT *
        FROM script_library
        WHERE scope = 'node' AND node_id = :nodeId
        ORDER BY alias COLLATE NOCASE ASC, created_at ASC
      `,
      mapScriptRow,
      {
        ':nodeId': input.nodeId ?? '',
      }
    );
  }

  if (input?.scope === 'global') {
    return queryMany(
      database,
      `
        SELECT *
        FROM script_library
        WHERE scope = 'global'
        ORDER BY alias COLLATE NOCASE ASC, created_at ASC
      `,
      mapScriptRow
    );
  }

  return queryMany(
    database,
    `
      SELECT *
      FROM script_library
      ORDER BY scope ASC, alias COLLATE NOCASE ASC, created_at ASC
    `,
    mapScriptRow
  );
}
```

并在返回对象中导出：

```ts
return {
  createScript,
  deleteScript,
  listManagedScripts,
  listResolvedScripts,
  updateScript,
};
```

- [ ] **Step 5: 暴露设置页使用的 HTTP 接口，并补齐前端 API**

在 `server/http/scriptRoutes.ts` 中加入：

```ts
app.get('/api/scripts/manage', (request, response) => {
  try {
    const scope = request.query['scope'];
    const nodeId =
      typeof request.query['nodeId'] === 'string' ? request.query['nodeId'] : undefined;

    response.json({
      items: scriptLibraryStore.listManagedScripts({
        scope: scope === 'global' || scope === 'node' ? scope : undefined,
        nodeId,
      }),
    });
  } catch (error) {
    console.error('[ScriptLibrary] manage list error:', error);
    response.status(500).json({ message: '脚本管理列表读取失败。' });
  }
});
```

在 `src/features/workbench/scriptApi.ts` 中加入：

```ts
export async function fetchManagedScripts(input?: { scope?: 'global' | 'node'; nodeId?: string | null }) {
  const url = new URL(`${buildServerHttpBaseUrl()}/api/scripts/manage`);

  if (input?.scope) {
    url.searchParams.set('scope', input.scope);
  }
  if (input?.nodeId) {
    url.searchParams.set('nodeId', input.nodeId);
  }

  const response = await fetch(url);
  const payload = await readJson<{ items: ScriptLibraryItem[] }>(response);
  return payload.items;
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm exec tsx --test server/scriptLibraryStore.test.ts server/serverApp.test.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add server/scriptLibraryStore.ts server/scriptLibraryStore.test.ts server/http/scriptRoutes.ts server/serverApp.test.ts src/features/workbench/scriptApi.ts
git commit -m "feat: add managed script listing for settings"
```

## Task 2: 新增设置页脚本管理 tab

**Files:**
- Create: `src/features/workbench/scriptSettingsModel.ts`
- Create: `src/features/workbench/scriptSettingsModel.test.ts`
- Create: `src/features/workbench/ScriptSettingsTab.tsx`

- [ ] **Step 1: 写失败测试，锁定设置页脚本查询参数模型**

在 `src/features/workbench/scriptSettingsModel.test.ts` 中加入：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildManagedScriptQuery, buildScriptSettingsIntro } from './scriptSettingsModel.js';

void test('buildManagedScriptQuery maps global and node scope to fetch params', () => {
  assert.deepEqual(buildManagedScriptQuery({ scope: 'global', selectedNodeId: '' }), {
    scope: 'global',
    nodeId: null,
  });

  assert.deepEqual(buildManagedScriptQuery({ scope: 'node', selectedNodeId: 'node-1' }), {
    scope: 'node',
    nodeId: 'node-1',
  });
});

void test('buildScriptSettingsIntro keeps x alias guidance visible in settings', () => {
  assert.match(buildScriptSettingsIntro(), /x alias/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec tsx --test src/features/workbench/scriptSettingsModel.test.ts`
Expected: FAIL，提示 `scriptSettingsModel` 尚不存在。

- [ ] **Step 3: 实现设置页脚本模型**

创建 `src/features/workbench/scriptSettingsModel.ts`：

```ts
export type ScriptSettingsScope = 'global' | 'node';

export function buildManagedScriptQuery(input: {
  scope: ScriptSettingsScope;
  selectedNodeId: string;
}) {
  if (input.scope === 'global') {
    return {
      scope: 'global' as const,
      nodeId: null,
    };
  }

  return {
    scope: 'node' as const,
    nodeId: input.selectedNodeId || null,
  };
}

export function buildScriptSettingsIntro() {
  return '在终端输入 x alias 可快速执行脚本。';
}
```

- [ ] **Step 4: 实现设置页脚本 tab**

创建 `src/features/workbench/ScriptSettingsTab.tsx`，核心结构保持“左列表 / 右详情”，但去掉抽屉关闭按钮和执行按钮，增加 scope / node 过滤：

```tsx
export function ScriptSettingsTab() {
  const [scope, setScope] = useState<ScriptSettingsScope>('global');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [nodes, setNodes] = useState<NodeSummaryRecord[]>([]);
  const [items, setItems] = useState<ScriptLibraryItem[]>([]);

  useEffect(() => {
    void fetchNodes().then((nextNodes) => {
      setNodes(nextNodes);
      if (nextNodes[0]) {
        setSelectedNodeId(nextNodes[0].id);
      }
    });
  }, []);

  useEffect(() => {
    const query = buildManagedScriptQuery({ scope, selectedNodeId });
    if (query.scope === 'node' && !query.nodeId) {
      setItems([]);
      return;
    }

    void fetchManagedScripts(query).then(setItems);
  }, [scope, selectedNodeId]);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-semibold tracking-tight">脚本</h3>
        <p className="mt-1 text-sm text-neutral-500">{buildScriptSettingsIntro()}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="space-y-5 rounded-xl border border-neutral-800/50 bg-[#17181b] p-5">
          <Select value={scope} onValueChange={(value) => setScope(value as ScriptSettingsScope)}>
            <SelectTrigger className="h-10 bg-[#0a0b0d] border-neutral-800/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">全局脚本</SelectItem>
              <SelectItem value="node">节点脚本</SelectItem>
            </SelectContent>
          </Select>
          {scope === 'node' ? (
            <Select value={selectedNodeId} onValueChange={setSelectedNodeId}>
              <SelectTrigger className="h-10 bg-[#0a0b0d] border-neutral-800/50">
                <SelectValue placeholder="选择节点" />
              </SelectTrigger>
              <SelectContent>
                {nodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </section>
        <section className="rounded-xl border border-neutral-800/50 bg-[#17181b] p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 alias、标题、标签" />
              <Button onClick={handleCreateScript}>新建脚本</Button>
            </div>
            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-lg border border-neutral-800/60 p-4 text-sm text-neutral-400">脚本列表区域</div>
              <div className="rounded-lg border border-neutral-800/60 p-4 text-sm text-neutral-400">脚本详情与编辑区域</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
```

实现细则：

- 保留当前 `ScriptLibraryPanel` 的创建 / 编辑 / 删除逻辑
- 取消 `onClose`
- 不再渲染“执行到当前会话”的区域
- `scope = node` 时显示节点下拉
- `scope = global` 时只显示全局脚本
- `scope = node` 时只显示所选节点脚本，不做 resolved 合并

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm exec tsx --test src/features/workbench/scriptSettingsModel.test.ts src/features/workbench/scriptLibraryModel.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/features/workbench/scriptSettingsModel.ts src/features/workbench/scriptSettingsModel.test.ts src/features/workbench/ScriptSettingsTab.tsx
git commit -m "feat: add script settings tab"
```

## Task 3: 设置页新增 scripts tab，并把左侧底栏接到设置路由

**Files:**
- Modify: `src/features/workbench/settingsNavigation.ts`
- Modify: `src/features/workbench/settingsNavigation.test.ts`
- Modify: `src/routes/settingsLazyTabs.tsx`
- Modify: `src/routes/SettingsPage.tsx`
- Modify: `src/features/workbench/sessionTreeChromeModel.ts`
- Modify: `src/features/workbench/sessionTreeChromeModel.test.ts`
- Modify: `src/features/workbench/SessionTreeFooter.tsx`
- Modify: `src/features/workbench/SessionTree.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`

- [ ] **Step 1: 写失败测试，锁定 settingsNavigation 支持 scripts**

在 `src/features/workbench/settingsNavigation.test.ts` 中加入：

```ts
assert.equal(buildSettingsPath('scripts'), '/settings?tab=scripts');
assert.equal(resolveSettingsTab(new URLSearchParams('tab=scripts')), 'scripts');
```

- [ ] **Step 2: 写失败测试，锁定左侧底栏顺序包含脚本**

把 `src/features/workbench/sessionTreeChromeModel.test.ts` 的底栏断言改成：

```ts
assert.deepEqual(buildSessionTreeFooterActions(), [
  { id: 'new-connection', label: '新建连接' },
  { id: 'open-scripts', label: '脚本' },
  { id: 'open-settings', label: '设置' },
  { id: 'collapse-sidebar', label: '收起侧栏' },
]);
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm exec tsx --test src/features/workbench/settingsNavigation.test.ts src/features/workbench/sessionTreeChromeModel.test.ts`
Expected: FAIL，提示 `scripts` tab 和 `open-scripts` 动作尚不存在。

- [ ] **Step 4: 增加 settings 路由与脚本 tab**

在 `src/features/workbench/settingsNavigation.ts` 中改为：

```ts
export const SETTINGS_PAGE_TABS = ['terminal', 'llm', 'memory', 'scripts'] as const;
```

在 `src/routes/settingsLazyTabs.tsx` 中加入：

```ts
export const LazyScriptSettingsTab = lazy(async () => {
  const module = await import('@/features/workbench/ScriptSettingsTab');
  return { default: module.ScriptSettingsTab };
});
```

在 `src/routes/SettingsPage.tsx` 中加入新的 tab：

```tsx
<TabsTrigger value="scripts">脚本</TabsTrigger>
```

以及内容区：

```tsx
<TabsContent value="scripts" forceMount={shouldRenderScriptsTab ? true : undefined}>
  {shouldRenderScriptsTab ? (
    <Suspense fallback={null}>
      <LazyScriptSettingsTab />
    </Suspense>
  ) : null}
</TabsContent>
```

同时把页头说明从：

```tsx
<p className="text-sm text-neutral-500 mt-0.5">配置终端和 AI 助手</p>
```

改为：

```tsx
<p className="text-sm text-neutral-500 mt-0.5">统一管理终端、LLM、记忆和脚本能力</p>
```

- [ ] **Step 5: 给左侧底栏新增“脚本”并统一走路由页**

在 `src/features/workbench/sessionTreeChromeModel.ts` 中加入：

```ts
{ id: 'open-scripts', label: '脚本' },
```

在 `src/features/workbench/SessionTreeFooter.tsx` 中增加新回调：

```tsx
type SessionTreeFooterProps = {
  onOpenNewConnection: () => void;
  onOpenScripts: () => void;
  onOpenSettings: () => void;
  onToggleCollapse: () => void;
};
```

并分发：

```tsx
if (action.id === 'open-scripts') {
  onOpenScripts();
  return;
}
```

在 `src/features/workbench/SessionTree.tsx` 和 `src/routes/WorkbenchPage.tsx` 中透传：

```tsx
onOpenScripts={() => {
  void navigate(buildSettingsPath('scripts'));
}}
onOpenSettings={() => {
  void navigate(buildSettingsPath());
}}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm exec tsx --test src/features/workbench/settingsNavigation.test.ts src/features/workbench/sessionTreeChromeModel.test.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/features/workbench/settingsNavigation.ts src/features/workbench/settingsNavigation.test.ts src/routes/settingsLazyTabs.tsx src/routes/SettingsPage.tsx src/features/workbench/sessionTreeChromeModel.ts src/features/workbench/sessionTreeChromeModel.test.ts src/features/workbench/SessionTreeFooter.tsx src/features/workbench/SessionTree.tsx src/routes/WorkbenchPage.tsx
git commit -m "feat: route scripts through settings page"
```

## Task 4: 移除工作台中的脚本抽屉、顶部入口、快捷键和旧设置侧板

**Files:**
- Modify: `src/features/workbench/workbenchHeaderActionsModel.ts`
- Modify: `src/features/workbench/workbenchHeaderActionsModel.test.ts`
- Modify: `src/features/workbench/workbenchShortcutModel.ts`
- Modify: `src/features/workbench/workbenchShortcutModel.test.ts`
- Modify: `src/features/workbench/useKeyboardShortcuts.ts`
- Modify: `src/features/workbench/helpDialogModel.ts`
- Modify: `src/features/workbench/helpDialogModel.test.ts`
- Modify: `src/features/workbench/useWorkbenchShellState.ts`
- Modify: `src/features/workbench/TerminalWorkspace.tsx`
- Modify: `src/features/workbench/TerminalWorkspaceHeader.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`
- Modify: `src/features/workbench/workbenchLazyPanels.tsx`
- Delete: `src/features/workbench/UtilityDrawer.tsx`
- Delete: `src/features/workbench/utilityDrawerModel.ts`
- Delete: `src/features/workbench/utilityDrawerModel.test.ts`
- Delete: `src/features/workbench/ScriptLibraryPanel.tsx`
- Delete: `src/features/workbench/TerminalSettingsPanel.tsx`

- [ ] **Step 1: 写失败测试，锁定顶部工具区只剩 Help / AI**

把 `src/features/workbench/workbenchHeaderActionsModel.test.ts` 首个断言改成：

```ts
assert.deepEqual(actions, [
  {
    behavior: 'openHelpDialog',
    display: 'label',
    id: 'helpDialog',
    icon: null,
    isActive: false,
    label: '?',
    shortcutLabel: '',
    tone: 'idle',
    title: '帮助与快捷键',
    variant: 'ghost',
  },
  {
    behavior: 'openAiAssistant',
    display: 'icon',
    id: 'aiAssistant',
    icon: 'sparkles',
    isActive: false,
    label: 'AI 助手',
    shortcutLabel: '⌘A',
    tone: 'accent',
    title: 'AI 助手 (⌘A)',
    variant: 'ghost',
  },
]);
```

- [ ] **Step 2: 写失败测试，锁定快捷键不再包含脚本抽屉**

把 `src/features/workbench/workbenchShortcutModel.test.ts` 改成：

```ts
void test('resolveWorkbenchShortcutAction no longer maps mod:semicolon to a script drawer', () => {
  assert.equal(resolveWorkbenchShortcutAction({ key: ';', mod: true }), null);
});

void test('formatWorkbenchShortcutLabel still supports ai assistant labels', () => {
  assert.equal(formatWorkbenchShortcutLabel('toggleAiAssistant', true), '⌘A');
});
```

- [ ] **Step 3: 写失败测试，锁定 Help 不再列出“打开脚本库”**

在 `src/features/workbench/helpDialogModel.test.ts` 中补一条：

```ts
assert.equal(content.shortcuts.some((item) => item.label === '打开脚本库'), false);
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm exec tsx --test src/features/workbench/workbenchHeaderActionsModel.test.ts src/features/workbench/workbenchShortcutModel.test.ts src/features/workbench/helpDialogModel.test.ts`
Expected: FAIL。

- [ ] **Step 5: 删除顶部脚本动作与脚本抽屉快捷键**

在 `src/features/workbench/workbenchHeaderActionsModel.ts` 中：

- 删除 `utilityDrawer` action id / behavior /状态输入
- `buildWorkbenchToolActions` 只返回 Help / AI
- `performWorkbenchToolAction` 删除 `onToggleUtilityDrawer`

核心形态：

```ts
export type WorkbenchToolActionId = 'helpDialog' | 'aiAssistant';

export function buildWorkbenchToolActions(input: {
  isMacShortcutPlatform: boolean;
}): WorkbenchToolAction[] {
  const aiAssistantShortcutLabel = formatWorkbenchShortcutLabel(
    'toggleAiAssistant',
    input.isMacShortcutPlatform
  );

  return [
    { ...helpAction },
    { ...aiAssistantAction, shortcutLabel: aiAssistantShortcutLabel },
  ];
}
```

在 `src/features/workbench/workbenchShortcutModel.ts` 中：

```ts
export type WorkbenchShortcutAction =
  | 'toggleQuickConnect'
  | 'toggleCommandHistory'
  | 'toggleLlmSettings'
  | 'toggleAiAssistant'
  | 'closeActiveTab'
  | 'openNewConnection'
  | 'switchToPrevTab'
  | 'switchToNextTab';
```

并删除：

```ts
case ';':
  return 'toggleUtilityDrawer' as const;
```

- [ ] **Step 6: 清掉工作台壳里的抽屉状态和旧设置侧板**

在 `src/features/workbench/useWorkbenchShellState.ts` 中删除：

```ts
isUtilityDrawerOpen
toggleUtilityDrawer
openUtilityDrawer
closeUtilityDrawer
isSettingsPanelOpen
openSettingsPanel
closeSettingsPanel
```

在 `src/routes/WorkbenchPage.tsx` 中删除：

- `UtilityDrawer` import
- `getWorkbenchContentGridClassName`
- `LazyTerminalSettingsPanel`
- `isUtilityDrawerOpen`
- `isSettingsPanelOpen`
- `toggleUtilityDrawer`
- `openSettingsPanel`
- `closeSettingsPanel`

核心目标是让工作台主体恢复为：

```tsx
<div className="flex min-h-screen bg-[var(--app-bg-base)]">
  <SessionTree ... />
  <TerminalWorkspace ... />
</div>
```

在 `src/features/workbench/TerminalWorkspace.tsx` 和 `src/features/workbench/TerminalWorkspaceHeader.tsx` 中同步删除：

- `isUtilityDrawerOpen`
- `onToggleUtilityDrawer`

- [ ] **Step 7: 更新 Help 文案**

在 `src/features/workbench/helpDialogModel.ts` 中删除：

```ts
{
  key: formatWorkbenchShortcutLabel('toggleUtilityDrawer', isMacShortcutPlatform),
  label: '打开脚本库',
},
```

并把引导文案改成：

```ts
'第一次使用时，建议先从新建连接开始，再结合 AI 助手、设置页中的脚本能力和会话标签完成日常操作。'
```

- [ ] **Step 8: 删除废弃文件**

删除：

```bash
rm src/features/workbench/UtilityDrawer.tsx
rm src/features/workbench/utilityDrawerModel.ts
rm src/features/workbench/utilityDrawerModel.test.ts
rm src/features/workbench/ScriptLibraryPanel.tsx
rm src/features/workbench/TerminalSettingsPanel.tsx
```

并在 `src/features/workbench/workbenchLazyPanels.tsx` 中移除 `LazyTerminalSettingsPanel`。

- [ ] **Step 9: 运行测试确认通过**

Run: `pnpm exec tsx --test src/features/workbench/workbenchHeaderActionsModel.test.ts src/features/workbench/workbenchShortcutModel.test.ts src/features/workbench/helpDialogModel.test.ts src/features/workbench/settingsNavigation.test.ts src/features/workbench/sessionTreeChromeModel.test.ts`
Expected: PASS。

- [ ] **Step 10: 提交**

```bash
git add src/features/workbench/workbenchHeaderActionsModel.ts src/features/workbench/workbenchHeaderActionsModel.test.ts src/features/workbench/workbenchShortcutModel.ts src/features/workbench/workbenchShortcutModel.test.ts src/features/workbench/useKeyboardShortcuts.ts src/features/workbench/helpDialogModel.ts src/features/workbench/helpDialogModel.test.ts src/features/workbench/useWorkbenchShellState.ts src/features/workbench/TerminalWorkspace.tsx src/features/workbench/TerminalWorkspaceHeader.tsx src/routes/WorkbenchPage.tsx src/features/workbench/workbenchLazyPanels.tsx src/features/workbench/SessionTreeFooter.tsx src/features/workbench/SessionTree.tsx src/features/workbench/sessionTreeChromeModel.ts
git rm src/features/workbench/UtilityDrawer.tsx src/features/workbench/utilityDrawerModel.ts src/features/workbench/utilityDrawerModel.test.ts src/features/workbench/ScriptLibraryPanel.tsx src/features/workbench/TerminalSettingsPanel.tsx
git commit -m "refactor: consolidate script access into settings"
```

## Task 5: 全量验证与收尾

**Files:**
- Verify only

- [ ] **Step 1: 运行类型检查**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 2: 运行本轮功能相关测试**

Run: `pnpm exec tsx --test server/scriptLibraryStore.test.ts server/serverApp.test.ts src/features/workbench/scriptSettingsModel.test.ts src/features/workbench/scriptLibraryModel.test.ts src/features/workbench/settingsNavigation.test.ts src/features/workbench/sessionTreeChromeModel.test.ts src/features/workbench/workbenchHeaderActionsModel.test.ts src/features/workbench/workbenchShortcutModel.test.ts src/features/workbench/helpDialogModel.test.ts src/features/workbench/terminalQuickScriptModel.test.ts src/features/workbench/TerminalQuickScriptDialog.test.ts`
Expected: PASS。

- [ ] **Step 3: 手动验收**

1. 打开 workbench，确认顶部无“脚本库”按钮。
2. 确认右侧只剩 AI 面板。
3. 确认左侧底栏出现“脚本”。
4. 点击“脚本”进入 `/settings?tab=scripts`。
5. 在设置页中切换到 `脚本` tab，确认可查看全局脚本和节点脚本。
6. 在终端里输入 `x alias`，确认快捷执行不受影响。

- [ ] **Step 4: 提交最终收尾**

```bash
git status --short
git commit --allow-empty -m "test: verify script settings consolidation"
```
