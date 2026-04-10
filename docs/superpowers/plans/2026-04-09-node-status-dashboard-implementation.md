# 节点状态 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OpsClaw 增加单节点状态 dashboard，打通“节点默认巡检脚本 -> 手动采集 -> JSON 快照存储 -> 固定 dashboard 渲染 -> 右键 / `x dashboard` / 快捷键入口”完整链路。

**Architecture:** 后端新增节点巡检存储与采集服务，使用现有节点凭据通过独立 SSH exec 完成手动采集，不依赖已有终端 session。脚本层继续复用现有脚本库，但新增 `usage` 语义区分 `quick_run` 与 `inspection`，前端用固定 schema `default_system` 渲染模态框，并通过设置页脚本管理承接“编辑巡检脚本”动作。

**Tech Stack:** TypeScript, React 19, Express, sql.js, ssh2, node:test, tsx

---

## File Map

### New Files

- `server/nodeInspectionScript.ts`
  - 默认巡检脚本常量、默认脚本 key/alias/title、固定 dashboard schema key。
- `server/nodeInspectionStore.ts`
  - `node_inspection_profiles` / `node_inspection_snapshots` 的读写、最近 10 条保留、最新成功快照查询。
- `server/nodeInspectionStore.test.ts`
  - profile upsert、snapshot retention、失败快照不覆盖成功快照等测试。
- `server/nodeInspectionRunner.ts`
  - 使用节点凭据发起一次独立 SSH exec，返回原始 stdout/stderr。
- `server/nodeInspectionService.ts`
  - 编排默认脚本创建、profile 绑定、手动采集、JSON 解析、快照落库、节点删除清理。
- `server/nodeInspectionService.test.ts`
  - 服务层对 bootstrap、collect、fallback、cleanup 的测试。
- `server/http/nodeDashboardRoutes.ts`
  - `GET /api/nodes/:id/dashboard` 与 `POST /api/nodes/:id/dashboard/collect`。
- `src/features/workbench/nodeDashboardApi.ts`
  - dashboard 查询、刷新 API。
- `src/features/workbench/nodeDashboardModel.ts`
  - 固定 dashboard schema 的摘要卡片、模块数据、空态/错误态判断。
- `src/features/workbench/nodeDashboardModel.test.ts`
  - 默认 JSON 到 UI section 的转换测试。
- `src/features/workbench/NodeStatusDashboardDialog.tsx`
  - 节点状态模态框 UI。
- `src/features/workbench/useNodeStatusDashboard.ts`
  - 控制打开、自动首采、刷新中的状态机。

### Existing Files To Modify

- `server/database.ts`
  - 增加 `script_library.usage` 列，以及巡检 profile/snapshot 表。
- `server/scriptLibraryStore.ts`
  - 扩展脚本 usage、过滤 `inspection` 与 `quick_run`。
- `server/scriptLibraryStore.test.ts`
  - 覆盖 usage 默认值、过滤与 alias 可见性。
- `server/http/support.ts`
  - 解析脚本 `usage`、扩展 HTTP 依赖注入类型。
- `server/http/scriptRoutes.ts`
  - 支持按 usage 查询管理列表；普通脚本解析默认只返回 `quick_run`。
- `server/httpApi.ts`
  - 注册 dashboard 路由。
- `server/serverApp.ts`
  - 创建并注入 inspection store / service。
- `server/http/nodeRoutes.ts`
  - 节点创建/导入时 bootstrap 默认巡检脚本与 profile；删除时清理。
- `server/httpRouteModules.test.ts`
  - 覆盖 dashboard 路由已注册。
- `server/serverApp.test.ts`
  - 覆盖 dashboard API 与节点创建联动。
- `src/features/workbench/types.ts`
  - 增加脚本 usage、dashboard/profile/snapshot 类型。
- `src/features/workbench/scriptApi.ts`
  - 请求脚本列表时显式按 usage 拉取；设置页管理列表支持 usage 过滤。
- `src/features/workbench/scriptSettingsModel.ts`
  - 新增脚本用途文案、inspection 过滤/空态。
- `src/features/workbench/scriptSettingsModel.test.ts`
  - 覆盖新的 usage 文案与过滤。
- `src/features/workbench/ScriptSettingsTab.tsx`
  - 在统一设置页中展示 inspection 脚本用途、过滤、badge，并允许编辑节点巡检脚本。
- `src/features/workbench/settingsNavigation.ts`
  - 增加跳转到脚本设置页并带上 `scope/nodeId/usage` 查询参数的 helper。
- `src/features/workbench/settingsNavigation.test.ts`
  - 覆盖新的 settings 查询参数 builder。
- `src/features/workbench/terminalQuickScriptModel.ts`
  - 增加 `x dashboard` 特判模型。
- `src/features/workbench/terminalQuickScriptModel.test.ts`
  - 覆盖 `x dashboard` 特判优先级。
- `src/features/workbench/useSshTerminalRuntime.ts`
  - 在终端输入阶段拦截 `x dashboard`，不向远端发送命令。
- `src/features/workbench/SshTerminalPane.tsx`
  - 将 dashboard 打开事件从终端层抬出。
- `src/features/workbench/TerminalWorkspace.tsx`
  - 透传 dashboard 打开动作到当前 tab。
- `src/features/workbench/workbenchShortcutModel.ts`
  - 新增打开当前节点 dashboard 的快捷键 action。
- `src/features/workbench/workbenchShortcutModel.test.ts`
  - 覆盖快捷键解析。
- `src/features/workbench/useKeyboardShortcuts.ts`
  - 绑定 dashboard 快捷键回调。
- `src/features/workbench/SessionTree.tsx`
  - 增加“节点状态”右键动作入口。
- `src/features/workbench/SessionTreeContextMenu.tsx`
  - Profile 右键菜单新增“节点状态”。
- `src/routes/WorkbenchPage.tsx`
  - 管理 dashboard modal 的打开节点、当前活动 session 节点、快捷键与三个入口汇合。
- `src/features/workbench/workbenchLazyPanels.tsx`
  - 懒加载 dashboard dialog。

## Task 1: 给脚本库补上 `usage` 语义并隔离 inspection 脚本

**Files:**
- Modify: `server/database.ts`
- Modify: `server/scriptLibraryStore.ts`
- Modify: `server/scriptLibraryStore.test.ts`
- Modify: `server/http/support.ts`
- Modify: `server/http/scriptRoutes.ts`
- Modify: `src/features/workbench/types.ts`
- Modify: `src/features/workbench/scriptApi.ts`
- Modify: `src/features/workbench/scriptSettingsModel.ts`
- Modify: `src/features/workbench/scriptSettingsModel.test.ts`
- Modify: `src/features/workbench/ScriptSettingsTab.tsx`

- [ ] **Step 1: 先写 usage 过滤的失败测试**

```ts
void test('resolved quick scripts exclude inspection scripts by default', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  store.createScript({
    key: 'restart-nginx',
    alias: 'nginx-restart',
    scope: 'node',
    nodeId: 'node-1',
    title: '重启 Nginx',
    description: '',
    kind: 'plain',
    content: 'systemctl restart nginx',
    variables: [],
    tags: [],
    usage: 'quick_run',
  });

  store.createScript({
    key: 'default-system-dashboard',
    alias: 'dashboard',
    scope: 'node',
    nodeId: 'node-1',
    title: '节点巡检',
    description: '',
    kind: 'plain',
    content: 'echo {}',
    variables: [],
    tags: [],
    usage: 'inspection',
  });

  const resolved = store.listResolvedScripts('node-1');
  const inspection = store.listManagedScripts({ scope: 'node', nodeId: 'node-1', usage: 'inspection' });

  assert.deepEqual(resolved.map((item) => item.alias), ['nginx-restart']);
  assert.deepEqual(inspection.map((item) => item.alias), ['dashboard']);
});
```

- [ ] **Step 2: 运行聚焦测试，确认当前实现尚不支持 usage**

Run: `pnpm exec tsx --test server/scriptLibraryStore.test.ts src/features/workbench/scriptSettingsModel.test.ts`

Expected: FAIL，错误会集中在 `usage` 字段不存在、过滤逻辑不存在，以及脚本设置模型缺少 inspection 文案。

- [ ] **Step 3: 用最小实现补齐脚本 usage**

在 `server/database.ts` 中给 `script_library` 加默认列：

```ts
database.run(`
  ALTER TABLE script_library
  ADD COLUMN usage TEXT NOT NULL DEFAULT 'quick_run';
`);
```

在 `server/scriptLibraryStore.ts` / `src/features/workbench/types.ts` 中增加类型：

```ts
export type ScriptUsage = 'quick_run' | 'inspection';

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
  usage: ScriptUsage;
  createdAt: string;
  updatedAt: string;
};
```

将 `listResolvedScripts` 默认改成只返回快捷脚本：

```ts
function listResolvedScripts(nodeId?: string, input?: { usage?: ScriptUsage }) {
  const usage = input?.usage ?? 'quick_run';

  const globalScripts = queryMany(
    database,
    `
      SELECT * FROM script_library
      WHERE scope = 'global' AND node_id IS NULL AND usage = :usage
    `,
    mapScriptRow,
    { ':usage': usage }
  );
```

并让设置页明确区分脚本用途：

```ts
export function buildScriptUsageLabel(usage: ScriptUsage) {
  return usage === 'inspection' ? '巡检脚本' : '快捷脚本';
}

export function buildManagedScriptQuery(input: {
  scope: ScriptSettingsScope;
  selectedNodeId: string;
  usage: ScriptUsage | 'all';
}) {
  return {
    scope: input.scope,
    nodeId: input.scope === 'node' ? input.selectedNodeId || null : null,
    usage: input.usage === 'all' ? undefined : input.usage,
  };
}
```

- [ ] **Step 4: 重新运行测试，确认 usage 语义稳定**

Run: `pnpm exec tsx --test server/scriptLibraryStore.test.ts src/features/workbench/scriptSettingsModel.test.ts`

Expected: PASS，且 `quick_run` 仍是默认行为，inspection 脚本不会混入普通 `x alias` 候选。

- [ ] **Step 5: 提交这一层变更**

```bash
git add server/database.ts server/scriptLibraryStore.ts server/scriptLibraryStore.test.ts \
  server/http/support.ts server/http/scriptRoutes.ts src/features/workbench/types.ts \
  src/features/workbench/scriptApi.ts src/features/workbench/scriptSettingsModel.ts \
  src/features/workbench/scriptSettingsModel.test.ts src/features/workbench/ScriptSettingsTab.tsx
git commit -m "feat: separate inspection scripts from quick scripts"
```

## Task 2: 建立巡检 profile / snapshot 存储与默认脚本基建

**Files:**
- Modify: `server/database.ts`
- Create: `server/nodeInspectionScript.ts`
- Create: `server/nodeInspectionStore.ts`
- Create: `server/nodeInspectionStore.test.ts`

- [ ] **Step 1: 先写快照保留与成功快照查询的失败测试**

```ts
void test('inspection snapshots keep only the latest 10 rows and preserve the latest success', async () => {
  const { createNodeInspectionStore } = await import('./nodeInspectionStore.js');
  const store = await createNodeInspectionStore();

  store.upsertProfile({
    nodeId: 'node-1',
    scriptId: 'script-1',
    dashboardSchemaKey: 'default_system',
  });

  for (let index = 0; index < 12; index += 1) {
    store.createSnapshot({
      nodeId: 'node-1',
      status: index === 11 ? 'error' : 'success',
      collectedAt: new Date(2026, 3, 9, 10, index).toISOString(),
      rawJson: index === 11 ? null : { schemaVersion: 1, cpu: { usagePercent: index } },
      summaryJson: index === 11 ? null : { cpuUsagePercent: index },
      errorMessage: index === 11 ? 'json parse failed' : null,
    });
  }

  const recent = store.listSnapshots('node-1');
  const latestSuccess = store.getLatestSuccessSnapshot('node-1');

  assert.equal(recent.length, 10);
  assert.equal(recent[0]?.status, 'error');
  assert.equal(latestSuccess?.summaryJson?.cpuUsagePercent, 10);
});
```

- [ ] **Step 2: 运行聚焦测试，确认 store 尚未存在**

Run: `pnpm exec tsx --test server/nodeInspectionStore.test.ts`

Expected: FAIL，提示 `createNodeInspectionStore` 模块不存在。

- [ ] **Step 3: 新增 inspection 表、默认脚本常量与 store**

在 `server/database.ts` 中新增表：

```ts
database.run(`
  CREATE TABLE IF NOT EXISTS node_inspection_profiles (
    node_id TEXT PRIMARY KEY,
    script_id TEXT NOT NULL,
    dashboard_schema_key TEXT NOT NULL DEFAULT 'default_system',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

database.run(`
  CREATE TABLE IF NOT EXISTS node_inspection_snapshots (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'error')),
    collected_at TEXT NOT NULL,
    raw_json TEXT,
    summary_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL
  );
`);
```

在 `server/nodeInspectionScript.ts` 中固定默认脚本元数据：

```ts
export const DEFAULT_INSPECTION_SCRIPT_KEY = 'default-system-dashboard';
export const DEFAULT_INSPECTION_SCRIPT_ALIAS = 'dashboard';
export const DEFAULT_INSPECTION_DASHBOARD_SCHEMA = 'default_system';

export const DEFAULT_INSPECTION_SCRIPT_CONTENT = String.raw`
set -eu
hostname_value="$(hostname 2>/dev/null || echo unknown)"
kernel_value="$(uname -r 2>/dev/null || echo unknown)"
arch_value="$(uname -m 2>/dev/null || echo unknown)"
printf '{"schemaVersion":1,"collectedAt":"%s","system":{"hostname":"%s","kernel":"%s","arch":"%s"}}\n' \
  "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  "$hostname_value" \
  "$kernel_value" \
  "$arch_value"
`.trim();
```

在 `server/nodeInspectionStore.ts` 中实现 retention：

```ts
function enforceSnapshotRetention(nodeId: string) {
  database.run(
    `
      DELETE FROM node_inspection_snapshots
      WHERE id IN (
        SELECT id
        FROM node_inspection_snapshots
        WHERE node_id = :nodeId
        ORDER BY collected_at DESC, created_at DESC
        LIMIT -1 OFFSET 10
      )
    `,
    { ':nodeId': nodeId }
  );
}
```

- [ ] **Step 4: 运行 store 测试，确认 retention 与 latest-success 工作正常**

Run: `pnpm exec tsx --test server/nodeInspectionStore.test.ts`

Expected: PASS，最新 10 条保留，失败快照不会让“最近成功快照”丢失。

- [ ] **Step 5: 提交数据层基建**

```bash
git add server/database.ts server/nodeInspectionScript.ts server/nodeInspectionStore.ts \
  server/nodeInspectionStore.test.ts
git commit -m "feat: add node inspection persistence"
```

## Task 3: 接入巡检服务、独立 SSH 采集和 dashboard HTTP API

**Files:**
- Create: `server/nodeInspectionRunner.ts`
- Create: `server/nodeInspectionService.ts`
- Create: `server/nodeInspectionService.test.ts`
- Create: `server/http/nodeDashboardRoutes.ts`
- Modify: `server/http/support.ts`
- Modify: `server/httpApi.ts`
- Modify: `server/serverApp.ts`
- Modify: `server/http/nodeRoutes.ts`
- Modify: `server/httpRouteModules.test.ts`
- Modify: `server/serverApp.test.ts`

- [ ] **Step 1: 先写服务层失败测试，锁定“无活动 session 也能采集”**

```ts
void test('collectNodeDashboard works without an existing terminal session', async () => {
  const { createNodeInspectionService } = await import('./nodeInspectionService.js');

  const service = createNodeInspectionService({
    nodeStore: {
      getNodeWithSecrets() {
        return {
          id: 'node-1',
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          jumpHostId: null,
          password: 'secret',
          privateKey: null,
          passphrase: null,
        };
      },
      getNode() {
        return { id: 'node-1', name: 'Prod A', host: '10.0.0.8', port: 22, username: 'ubuntu' };
      },
    } as never,
    scriptLibraryStore: {
      getScript() {
        return {
          id: 'script-1',
          key: 'default-system-dashboard',
          alias: 'dashboard',
          scope: 'node',
          nodeId: 'node-1',
          title: '节点巡检',
          description: '',
          kind: 'plain',
          content: 'echo ok',
          variables: [],
          tags: [],
          usage: 'inspection',
          createdAt: '',
          updatedAt: '',
        };
      },
      createScript() {
        throw new Error('should not create');
      },
    } as never,
    inspectionStore: createFakeInspectionStore(),
    runInspectionCommand: async () =>
      '{"schemaVersion":1,"collectedAt":"2026-04-09T10:00:00.000Z","cpu":{"usagePercent":42}}',
  });

  const result = await service.collectNodeDashboard('node-1');
  assert.equal(result.latestSnapshot?.status, 'success');
  assert.equal(result.latestSnapshot?.summaryJson?.cpuUsagePercent, 42);
});
```

- [ ] **Step 2: 运行服务与路由聚焦测试，确认当前尚未实现**

Run: `pnpm exec tsx --test server/nodeInspectionService.test.ts server/httpRouteModules.test.ts server/serverApp.test.ts`

Expected: FAIL，缺少 inspection service、dashboard 路由和节点创建联动。

- [ ] **Step 3: 实现独立 SSH runner、服务编排和 API**

在 `server/nodeInspectionRunner.ts` 中直接用节点凭据采集：

```ts
export async function runInspectionCommandOnNode(
  node: StoredNodeWithSecrets,
  command: string
): Promise<{ stdout: string; stderr: string }> {
  const client = new Client();

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    client.on('ready', () => {
      client.exec(`sh -lc ${JSON.stringify(command)}`, (error, channel) => {
        if (error) {
          reject(error);
          return;
        }

        channel.on('data', (chunk) => {
          stdout += chunk instanceof Buffer ? chunk.toString('utf8') : String(chunk);
        });
        channel.stderr.on('data', (chunk) => {
          stderr += chunk instanceof Buffer ? chunk.toString('utf8') : String(chunk);
        });
        channel.on('close', () => {
          client.end();
          resolve({ stdout, stderr });
        });
      });
    });

    client.on('error', reject);
    client.connect({
      host: node.host,
      port: node.port,
      username: node.username,
      password: node.password ?? undefined,
      privateKey: node.privateKey ?? undefined,
      passphrase: node.passphrase ?? undefined,
    });
  });
}
```

在 `server/nodeInspectionService.ts` 中组合 bootstrap + collect：

```ts
async function ensureDefaultInspectionProfile(nodeId: string) {
  const current = inspectionStore.getProfile(nodeId);
  if (current) {
    return current;
  }

  const existingScript = scriptLibraryStore.listManagedScripts({
    scope: 'node',
    nodeId,
    usage: 'inspection',
  })[0];

  const script =
    existingScript ??
    scriptLibraryStore.createScript({
      key: DEFAULT_INSPECTION_SCRIPT_KEY,
      alias: DEFAULT_INSPECTION_SCRIPT_ALIAS,
      scope: 'node',
      nodeId,
      title: '节点默认巡检',
      description: '为节点状态 dashboard 提供标准 JSON 数据。',
      kind: 'plain',
      content: DEFAULT_INSPECTION_SCRIPT_CONTENT,
      variables: [],
      tags: ['dashboard', 'inspection'],
      usage: 'inspection',
    });

  return inspectionStore.upsertProfile({
    nodeId,
    scriptId: script.id,
    dashboardSchemaKey: DEFAULT_INSPECTION_DASHBOARD_SCHEMA,
  });
}
```

并新增 dashboard 路由：

```ts
app.get('/api/nodes/:id/dashboard', async (request, response) => {
  const result = await nodeInspectionService.getNodeDashboard(request.params.id);
  response.json(result);
});

app.post('/api/nodes/:id/dashboard/collect', async (request, response) => {
  const result = await nodeInspectionService.collectNodeDashboard(request.params.id);
  response.json(result);
});
```

节点创建与删除编排放在 `server/http/nodeRoutes.ts`：

```ts
const node = await nodeStore.createNode(parseNodeInput(request.body));
if (node) {
  await nodeInspectionService.ensureNodeBootstrap(node.id);
}
```

```ts
const deleted = await nodeStore.deleteNode(request.params.id);
if (deleted) {
  await nodeInspectionService.deleteNodeInspectionData(request.params.id);
}
```

- [ ] **Step 4: 跑通服务与 API 测试**

Run: `pnpm exec tsx --test server/nodeInspectionService.test.ts server/httpRouteModules.test.ts server/serverApp.test.ts`

Expected: PASS，且节点创建会自动拥有 inspection profile，dashboard API 可返回最新快照与最近 10 条摘要。

- [ ] **Step 5: 提交服务层与 API**

```bash
git add server/nodeInspectionRunner.ts server/nodeInspectionService.ts \
  server/nodeInspectionService.test.ts server/http/nodeDashboardRoutes.ts \
  server/http/support.ts server/httpApi.ts server/serverApp.ts \
  server/http/nodeRoutes.ts server/httpRouteModules.test.ts server/serverApp.test.ts
git commit -m "feat: add node dashboard backend service"
```

## Task 4: 构建默认 dashboard 模态框与设置页编辑入口

**Files:**
- Create: `src/features/workbench/nodeDashboardApi.ts`
- Create: `src/features/workbench/nodeDashboardModel.ts`
- Create: `src/features/workbench/nodeDashboardModel.test.ts`
- Create: `src/features/workbench/NodeStatusDashboardDialog.tsx`
- Create: `src/features/workbench/useNodeStatusDashboard.ts`
- Modify: `src/features/workbench/types.ts`
- Modify: `src/features/workbench/settingsNavigation.ts`
- Modify: `src/features/workbench/settingsNavigation.test.ts`
- Modify: `src/features/workbench/workbenchLazyPanels.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`

- [ ] **Step 1: 先写默认 schema 的模型失败测试**

```ts
void test('buildNodeDashboardSections renders default_system summary cards and modules', async () => {
  const { buildNodeDashboardSections } = await import('./nodeDashboardModel.js');

  const sections = buildNodeDashboardSections({
    dashboardSchemaKey: 'default_system',
    latestSnapshot: {
      id: 'snapshot-1',
      nodeId: 'node-1',
      status: 'success',
      collectedAt: '2026-04-09T10:00:00.000Z',
      rawJson: {
        schemaVersion: 1,
        cpu: { usagePercent: 42, load1: 0.51 },
        memory: { usagePercent: 63.5, availableBytes: 2048 },
        disk: { filesystems: [{ mount: '/', usagePercent: 71.2 }] },
      },
      summaryJson: {
        cpuUsagePercent: 42,
        memoryUsagePercent: 63.5,
        rootDiskUsagePercent: 71.2,
        load1: 0.51,
      },
      errorMessage: null,
    },
  });

  assert.equal(sections.summaryCards[0]?.label, 'CPU');
  assert.equal(sections.summaryCards[0]?.value, '42%');
  assert.equal(sections.modules.some((item) => item.id === 'top-processes'), true);
});
```

- [ ] **Step 2: 运行前端模型测试，确认还没有 dashboard UI 层**

Run: `pnpm exec tsx --test src/features/workbench/nodeDashboardModel.test.ts src/features/workbench/settingsNavigation.test.ts`

Expected: FAIL，缺少 dashboard 类型、模型函数和带查询参数的 settings path helper。

- [ ] **Step 3: 实现 dashboard API、模型和对话框**

在 `src/features/workbench/types.ts` 中补齐结构：

```ts
export type NodeInspectionSnapshot = {
  id: string;
  nodeId: string;
  status: 'success' | 'error';
  collectedAt: string;
  rawJson: Record<string, unknown> | null;
  summaryJson: {
    cpuUsagePercent?: number | null;
    memoryUsagePercent?: number | null;
    rootDiskUsagePercent?: number | null;
    load1?: number | null;
  } | null;
  errorMessage: string | null;
};

export type NodeDashboardPayload = {
  node: Pick<SavedConnectionProfile, 'id' | 'name' | 'host' | 'username'>;
  profile: {
    nodeId: string;
    scriptId: string;
    dashboardSchemaKey: 'default_system';
  } | null;
  latestSnapshot: NodeInspectionSnapshot | null;
  recentSnapshots: NodeInspectionSnapshot[];
};
```

在 `src/features/workbench/settingsNavigation.ts` 中增加跳转 helper：

```ts
export function buildInspectionScriptSettingsPath(nodeId: string) {
  const params = new URLSearchParams({
    tab: 'scripts',
    scope: 'node',
    nodeId,
    usage: 'inspection',
  });

  return `/settings?${params.toString()}`;
}
```

在 `src/features/workbench/useNodeStatusDashboard.ts` 中处理“无快照则自动首采”：

```ts
useEffect(() => {
  if (!open || !nodeId || loading || refreshing) {
    return;
  }

  if (payload?.latestSnapshot === null && autoCollectRequestedRef.current !== nodeId) {
    autoCollectRequestedRef.current = nodeId;
    void refresh();
  }
}, [loading, nodeId, open, payload, refreshing, refresh]);
```

模态框 header 固定包含：

```tsx
<Button
  onClick={() => {
    void navigate(buildInspectionScriptSettingsPath(payload.node.id));
  }}
  variant="outline"
>
  编辑巡检脚本
</Button>
```

- [ ] **Step 4: 运行 dashboard 模型与设置跳转测试**

Run: `pnpm exec tsx --test src/features/workbench/nodeDashboardModel.test.ts src/features/workbench/settingsNavigation.test.ts`

Expected: PASS，摘要卡片与模块转换稳定，设置页跳转路径带有 `usage=inspection`。

- [ ] **Step 5: 提交 dashboard UI 主体**

```bash
git add src/features/workbench/nodeDashboardApi.ts src/features/workbench/nodeDashboardModel.ts \
  src/features/workbench/nodeDashboardModel.test.ts src/features/workbench/NodeStatusDashboardDialog.tsx \
  src/features/workbench/useNodeStatusDashboard.ts src/features/workbench/types.ts \
  src/features/workbench/settingsNavigation.ts src/features/workbench/settingsNavigation.test.ts \
  src/features/workbench/workbenchLazyPanels.tsx src/routes/WorkbenchPage.tsx
git commit -m "feat: add node dashboard dialog"
```

## Task 5: 接入右键菜单、`x dashboard` 和快捷键三个入口

**Files:**
- Modify: `src/features/workbench/terminalQuickScriptModel.ts`
- Modify: `src/features/workbench/terminalQuickScriptModel.test.ts`
- Modify: `src/features/workbench/useSshTerminalRuntime.ts`
- Modify: `src/features/workbench/SshTerminalPane.tsx`
- Modify: `src/features/workbench/TerminalWorkspace.tsx`
- Modify: `src/features/workbench/workbenchShortcutModel.ts`
- Modify: `src/features/workbench/workbenchShortcutModel.test.ts`
- Modify: `src/features/workbench/useKeyboardShortcuts.ts`
- Modify: `src/features/workbench/SessionTree.tsx`
- Modify: `src/features/workbench/SessionTreeContextMenu.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`

- [ ] **Step 1: 先写入口层失败测试，锁定 `x dashboard` 优先级**

```ts
void test('detectTerminalQuickScriptQuery treats x dashboard as dashboard action instead of script alias', async () => {
  const {
    resolveTerminalDashboardShortcut,
    detectTerminalQuickScriptQuery,
  } = await import('./terminalQuickScriptModel.js');

  assert.equal(resolveTerminalDashboardShortcut('x dashboard'), true);
  assert.equal(resolveTerminalDashboardShortcut('x Dashboard'), true);
  assert.equal(detectTerminalQuickScriptQuery('x dashboard'), null);
  assert.equal(resolveTerminalDashboardShortcut('x dashboard now'), false);
});
```

并为快捷键补测试：

```ts
void test('resolveWorkbenchShortcutAction supports node dashboard shortcut', async () => {
  const { resolveWorkbenchShortcutAction } = await import('./workbenchShortcutModel.js');
  assert.equal(resolveWorkbenchShortcutAction({ key: 'd', mod: true }), 'openNodeDashboard');
});
```

- [ ] **Step 2: 运行入口层聚焦测试，确认当前还没有三个入口**

Run: `pnpm exec tsx --test src/features/workbench/terminalQuickScriptModel.test.ts src/features/workbench/workbenchShortcutModel.test.ts`

Expected: FAIL，`x dashboard` 仍会被当成普通 alias 查询，快捷键 action 不存在。

- [ ] **Step 3: 实现三个入口汇合到同一个 modal**

在 `src/features/workbench/terminalQuickScriptModel.ts` 中加入专用特判：

```ts
export function resolveTerminalDashboardShortcut(input: string) {
  return input.trim().toLowerCase() === 'x dashboard';
}

export function detectTerminalQuickScriptQuery(input: string) {
  if (resolveTerminalDashboardShortcut(input)) {
    return null;
  }
  if (!input.startsWith(TERMINAL_QUICK_SCRIPT_PREFIX)) {
    return null;
  }
  return input.slice(TERMINAL_QUICK_SCRIPT_PREFIX.length);
}
```

在 `useSshTerminalRuntime.ts` 中拦截：

```ts
if (resolveTerminalDashboardShortcut(inputBufferRef.current)) {
  clearQuickScriptSuggestions();
  inputBufferRef.current = '';
  openNodeDashboardRef.current?.();
  return;
}
```

在 `workbenchShortcutModel.ts` 中新增 action：

```ts
export type WorkbenchShortcutAction =
  | 'toggleQuickConnect'
  | 'toggleCommandHistory'
  | 'toggleLlmSettings'
  | 'toggleAiAssistant'
  | 'openNodeDashboard'
  | 'closeActiveTab'
  | 'openNewConnection'
  | 'switchToPrevTab'
  | 'switchToNextTab';
```

并在 `SessionTreeContextMenu.tsx` 的 profile 菜单里新增：

```tsx
<button
  className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
  onClick={() => {
    onOpenNodeDashboard(contextMenuState.profile);
    onRequestClose();
  }}
  type="button"
>
  节点状态
</button>
```

`WorkbenchPage.tsx` 中统一处理：

```ts
const openNodeDashboardForProfile = (profile: SavedConnectionProfile) => {
  setNodeDashboardNodeId(profile.id);
  setNodeDashboardOpen(true);
};

const openNodeDashboardForActiveSession = () => {
  const active = sessions.find((session) => session.id === activeSessionId);
  if (!active?.nodeId) {
    return;
  }
  setNodeDashboardNodeId(active.nodeId);
  setNodeDashboardOpen(true);
};
```

- [ ] **Step 4: 运行入口层测试并做一次类型检查**

Run: `pnpm exec tsx --test src/features/workbench/terminalQuickScriptModel.test.ts src/features/workbench/workbenchShortcutModel.test.ts`

Expected: PASS，`x dashboard` 不再走远端 shell，快捷键与右键入口都能落到同一 open handler。

Run: `pnpm typecheck`

Expected: PASS。

- [ ] **Step 5: 提交入口层接入**

```bash
git add src/features/workbench/terminalQuickScriptModel.ts \
  src/features/workbench/terminalQuickScriptModel.test.ts \
  src/features/workbench/useSshTerminalRuntime.ts src/features/workbench/SshTerminalPane.tsx \
  src/features/workbench/TerminalWorkspace.tsx src/features/workbench/workbenchShortcutModel.ts \
  src/features/workbench/workbenchShortcutModel.test.ts src/features/workbench/useKeyboardShortcuts.ts \
  src/features/workbench/SessionTree.tsx src/features/workbench/SessionTreeContextMenu.tsx \
  src/routes/WorkbenchPage.tsx
git commit -m "feat: wire node dashboard entrypoints"
```

## Task 6: 完整回归验证并收尾

**Files:**
- Modify: `server/serverApp.test.ts`
- Modify: `src/routes/WorkbenchPage.tsx`
- Modify: `src/features/workbench/NodeStatusDashboardDialog.tsx`

- [ ] **Step 1: 补一条端到端回归测试，覆盖“节点创建后可直接打开 dashboard”**

```ts
void test('dashboard endpoint returns bootstrap profile for a newly created node', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const { server, port } = await createOpsClawServerApp({ port: 0 });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const actualPort = (server.address() as AddressInfo).port;

  const createResponse = await fetch(`http://127.0.0.1:${actualPort}/api/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Prod A',
      host: '10.0.0.8',
      port: 22,
      username: 'ubuntu',
      authMode: 'password',
      password: 'secret',
    }),
  });

  const node = (await createResponse.json() as { item: { id: string } }).item;
  const dashboardResponse = await fetch(`http://127.0.0.1:${actualPort}/api/nodes/${node.id}/dashboard`);
  const payload = await dashboardResponse.json() as { profile: { dashboardSchemaKey: string } };

  assert.equal(payload.profile.dashboardSchemaKey, 'default_system');
  server.close();
});
```

- [ ] **Step 2: 跑完整相关测试集**

Run: `pnpm exec tsx --test server/scriptLibraryStore.test.ts server/nodeInspectionStore.test.ts server/nodeInspectionService.test.ts server/httpRouteModules.test.ts server/serverApp.test.ts src/features/workbench/scriptSettingsModel.test.ts src/features/workbench/nodeDashboardModel.test.ts src/features/workbench/terminalQuickScriptModel.test.ts src/features/workbench/workbenchShortcutModel.test.ts src/features/workbench/settingsNavigation.test.ts`

Expected: PASS。

- [ ] **Step 3: 跑 lint 与类型检查**

Run: `pnpm lint`

Expected: PASS。

Run: `pnpm typecheck`

Expected: PASS。

- [ ] **Step 4: 手动冒烟验证桌面工作流**

Run: `pnpm dev`

Expected:
- 新建节点后 `GET /api/nodes/:id/dashboard` 立刻返回 profile
- 右键节点可打开 dashboard modal
- `x dashboard` 打开 modal，不向远端 shell 发送任何字符
- dashboard 首次无快照时自动触发一次采集
- 设置页脚本筛选到 `inspection` 时可看到并编辑默认巡检脚本

- [ ] **Step 5: 提交收尾**

```bash
git add server/serverApp.test.ts src/routes/WorkbenchPage.tsx src/features/workbench/NodeStatusDashboardDialog.tsx
git commit -m "test: verify node dashboard workflow"
```

## Self-Review

### Spec Coverage

- “手动采集 + 固定 dashboard + 快照存储基础设施”:
  - Task 2, Task 3, Task 4 覆盖。
- “每个节点建立默认巡检配置”:
  - Task 2 默认脚本，Task 3 节点创建 bootstrap 覆盖。
- “每个节点只保留最新 10 条快照”:
  - Task 2 retention 覆盖。
- “固定模块：系统概览、CPU、内存、磁盘、网络、负载、Top 进程”:
  - Task 4 默认 schema 渲染覆盖。
- “入口：右键、`x dashboard`、快捷键”:
  - Task 5 覆盖。
- “inspection 脚本复用脚本库，但不混入普通 `x alias`”:
  - Task 1 覆盖。
- “失败不能破坏最近一次成功快照”:
  - Task 2 / Task 3 覆盖。
- “编辑巡检脚本”:
  - Task 1 设置页 usage 管理 + Task 4 从 modal 跳转到 inspection 过滤视图覆盖。

### Placeholder Scan

- 已避免 `TODO` / `TBD` / “类似 Task N” 这类占位描述。
- 每个 task 都给出具体文件、测试、命令和实现片段。

### Type Consistency

- 脚本用途统一使用 `ScriptUsage = 'quick_run' | 'inspection'`。
- dashboard schema key 统一使用 `'default_system'`。
- snapshot 状态统一使用 `'success' | 'error'`。
- 前后端共享的 inspection snapshot/profile 命名保持一致。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-09-node-status-dashboard-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
