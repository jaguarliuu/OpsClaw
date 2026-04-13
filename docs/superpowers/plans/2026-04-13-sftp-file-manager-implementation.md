# SFTP File Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OpsClaw 增加节点级 SFTP 文件管理器，交付“独立 SFTP runtime + 单栏远端文件浏览 + 原生文件选择器上传下载 + 右侧抽屉 + 可恢复传输队列 + 高风险操作审批”的第一阶段完整闭环。

**Architecture:** 后端新增独立于 terminal 的 SFTP 连接与传输服务，通过 `ssh2` 建立专门的 SFTP 通道，并用数据库持久化 host key 指纹与传输任务 checkpoint。前端在 workbench 中新增节点级主视图状态，SFTP 只在活动节点打开时挂载一份文件管理视图，使用 Electron 原生文件选择器触发上传下载，并复用现有 `InteractionCard` 视觉体系承载高风险操作审批。

**Tech Stack:** TypeScript, React 19, Express, Electron, ssh2, sql.js, node:test via `pnpm exec tsx --test`

---

## File Map

### New Files

- `electron/nativeDialogs.ts`
  - Electron 主进程文件选择器与保存对话框的 IPC handler、结果清洗与窗口绑定。
- `electron/nativeDialogs.test.ts`
  - 原生文件对话框结果归一化、取消场景、非法 payload 清洗测试。
- `server/sftpStore.ts`
  - 持久化 SFTP host key 指纹、传输任务记录与 checkpoint 读写。
- `server/sftpStore.test.ts`
  - 覆盖 host key upsert、任务状态流转、任务恢复查询。
- `server/sftpConnectionManager.ts`
  - 按 `nodeId` 管理独立 SFTP 连接、host key 校验、挂起/回收策略。
- `server/sftpService.ts`
  - 目录浏览、文件 metadata、预览、创建目录、重命名、删除、权限修改的编排层。
- `server/sftpService.test.ts`
  - 覆盖目录浏览、风险操作参数校验、错误映射。
- `server/sftpTransferManager.ts`
  - 上传/下载任务队列、分块传输、暂停恢复、重试、断点续传与临时文件提交。
- `server/sftpTransferManager.test.ts`
  - 覆盖 checkpoint、失败重试、恢复、临时文件 rename、校验失败场景。
- `server/http/sftpRoutes.ts`
  - `/api/nodes/:id/sftp/*` 路由，承接浏览、操作、队列与审批触发。
- `src/features/workbench/desktopFileDialogApi.ts`
  - 浏览器侧原生文件对话框桥接与 desktop/runtime 能力检测。
- `src/features/workbench/sftpApi.ts`
  - 前端 SFTP HTTP API。
- `src/features/workbench/sftpModel.ts`
  - SFTP 纯函数模型：路径面包屑、文件列表排序、风险判断、抽屉 tab、任务聚合。
- `src/features/workbench/sftpModel.test.ts`
  - 覆盖排序、预览策略、批量风险分类、任务聚合与路径模型。
- `src/features/workbench/workbenchPrimaryViewModel.ts`
  - 管理 workbench 当前主视图：`terminal` / `sftp`。
- `src/features/workbench/workbenchPrimaryViewModel.test.ts`
  - 覆盖从 session / 节点树切换到 SFTP 时的状态演算。
- `src/features/workbench/useWorkbenchPrimaryView.ts`
  - Workbench 主视图状态 hook。
- `src/features/workbench/useSftpFileManager.ts`
  - SFTP 页面状态机：加载目录、刷新、选中、打开抽屉、启动传输、轮询任务。
- `src/features/workbench/SftpFileManagerView.tsx`
  - SFTP 主视图 UI。
- `src/features/workbench/SftpRightDrawer.tsx`
  - 右侧抽屉，展示预览、元数据、权限编辑、任务详情。
- `src/features/workbench/SftpTransferQueue.tsx`
  - 传输队列列表和任务操作按钮。
- `src/features/workbench/sftpActionGateModel.ts`
  - 将用户侧 SFTP 高风险操作转换为可渲染的交互卡片 request。
- `src/features/workbench/sftpActionGateModel.test.ts`
  - 覆盖覆盖上传、批量删除、权限修改的 request 构造。

### Existing Files To Modify

- `electron/main.ts`
  - 注册 native dialog IPC。
- `electron/preload.ts`
  - 向 renderer 暴露 `__OPSCLAW_FILE_DIALOG__`。
- `server/database.ts`
  - 增加 `sftp_host_keys` 和 `sftp_transfer_tasks` 表及索引。
- `server/serverApp.ts`
  - 创建并注入 SFTP store / service / transfer manager。
- `server/httpApi.ts`
  - 注册 SFTP 路由。
- `server/http/support.ts`
  - 扩展 SFTP 依赖类型与请求解析 helpers。
- `server/serverApp.test.ts`
  - 覆盖 SFTP API 注册、节点删除联动清理。
- `src/features/workbench/types.ts`
  - 增加桌面文件对话框、SFTP 文件项、目录 payload、任务类型。
- `src/routes/WorkbenchPage.tsx`
  - 引入主视图状态，在 terminal 与 SFTP 间切换，汇总节点树与 session 快捷入口。
- `src/features/workbench/TerminalWorkspace.tsx`
  - 头部增加切换到当前节点 SFTP 的动作。
- `src/features/workbench/TerminalWorkspaceHeader.tsx`
  - 渲染 SFTP 入口按钮。
- `src/features/workbench/SessionTree.tsx`
  - 节点树新增“打开 SFTP”入口透传。
- `src/features/workbench/SessionTreeContextMenu.tsx`
  - 右键菜单增加“打开 SFTP”。
- `src/features/workbench/workbenchLazyPanels.tsx`
  - 如抽屉/视图需要懒加载，在这里注册。
- `src/features/workbench/InteractionCard.tsx`
  - 允许复用于用户侧 SFTP gate request，避免 AI 专属命名限制。
- `src/features/workbench/PendingGatePanel.tsx`
  - 如需共用列表壳体，抽出通用 card 容器或兼容本地 gate item。

## Task 1: 桌面文件选择器桥接与共享 SFTP 类型

**Files:**
- Create: `electron/nativeDialogs.ts`
- Test: `electron/nativeDialogs.test.ts`
- Create: `src/features/workbench/desktopFileDialogApi.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/features/workbench/types.ts`

- [ ] **Step 1: 先写失败测试，锁定原生文件对话框结果归一化**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeOpenDialogResult,
  normalizeSaveDialogResult,
} from './nativeDialogs.js';

test('normalizeOpenDialogResult strips empty paths and preserves cancellation', () => {
  assert.deepEqual(
    normalizeOpenDialogResult({
      canceled: false,
      filePaths: ['/tmp/a.txt', '', '   ', '/tmp/b.txt'],
    }),
    {
      canceled: false,
      paths: ['/tmp/a.txt', '/tmp/b.txt'],
    }
  );

  assert.deepEqual(
    normalizeOpenDialogResult({
      canceled: true,
      filePaths: ['/tmp/a.txt'],
    }),
    {
      canceled: true,
      paths: [],
    }
  );
});

test('normalizeSaveDialogResult returns null path when user cancels', () => {
  assert.deepEqual(
    normalizeSaveDialogResult({
      canceled: true,
      filePath: '/tmp/out.log',
    }),
    {
      canceled: true,
      path: null,
    }
  );
});
```

- [ ] **Step 2: 运行测试，确认当前仓库还没有文件对话框桥接**

Run: `pnpm exec tsx --test electron/nativeDialogs.test.ts`

Expected: FAIL，提示 `nativeDialogs.ts` 不存在。

- [ ] **Step 3: 实现主进程 handler、preload 暴露与 renderer 类型**

在 `electron/nativeDialogs.ts` 中定义结果与 handler：

```ts
import { BrowserWindow, dialog, ipcMain } from 'electron';

export type NativeOpenDialogResult = {
  canceled: boolean;
  paths: string[];
};

export type NativeSaveDialogResult = {
  canceled: boolean;
  path: string | null;
};

export function normalizeOpenDialogResult(input: {
  canceled: boolean;
  filePaths: string[];
}): NativeOpenDialogResult {
  return {
    canceled: input.canceled,
    paths: input.canceled
      ? []
      : input.filePaths.map((item) => item.trim()).filter(Boolean),
  };
}

export function normalizeSaveDialogResult(input: {
  canceled: boolean;
  filePath?: string | null;
}): NativeSaveDialogResult {
  return {
    canceled: input.canceled,
    path: input.canceled ? null : input.filePath?.trim() || null,
  };
}

export function registerNativeDialogHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('opsclaw:file-dialog:open', async (_event, options) => {
    const result = await dialog.showOpenDialog(getWindow() ?? undefined, options);
    return normalizeOpenDialogResult(result);
  });

  ipcMain.handle('opsclaw:file-dialog:save', async (_event, options) => {
    const result = await dialog.showSaveDialog(getWindow() ?? undefined, options);
    return normalizeSaveDialogResult(result);
  });
}
```

在 `src/features/workbench/types.ts` 中扩展全局类型：

```ts
export type OpsClawDesktopFileDialog = {
  pickFiles: (options?: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    multiSelections?: boolean;
  }) => Promise<{ canceled: boolean; paths: string[] }>;
  pickSavePath: (options?: {
    title?: string;
    defaultPath?: string;
  }) => Promise<{ canceled: boolean; path: string | null }>;
};

declare global {
  interface Window {
    __OPSCLAW_FILE_DIALOG__?: OpsClawDesktopFileDialog;
  }
}
```

在 `electron/preload.ts` 中暴露桥接对象：

```ts
import { clipboard, contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__OPSCLAW_FILE_DIALOG__', {
  pickFiles: (options?: unknown) => ipcRenderer.invoke('opsclaw:file-dialog:open', options),
  pickSavePath: (options?: unknown) => ipcRenderer.invoke('opsclaw:file-dialog:save', options),
});
```

在 `src/features/workbench/desktopFileDialogApi.ts` 中封装浏览器侧调用：

```ts
export async function pickUploadFiles() {
  if (!window.__OPSCLAW_FILE_DIALOG__) {
    throw new Error('当前运行环境不支持原生文件选择器。');
  }

  return window.__OPSCLAW_FILE_DIALOG__.pickFiles({
    title: '选择要上传的文件',
    multiSelections: true,
  });
}
```

- [ ] **Step 4: 重新运行测试，确认桥接层稳定**

Run: `pnpm exec tsx --test electron/nativeDialogs.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交这一层变更**

```bash
git add electron/nativeDialogs.ts electron/nativeDialogs.test.ts electron/main.ts \
  electron/preload.ts src/features/workbench/desktopFileDialogApi.ts \
  src/features/workbench/types.ts
git commit -m "feat: add desktop file dialog bridge for sftp"
```

## Task 2: 建立 SFTP 持久化基础，包括 host key 与传输任务表

**Files:**
- Modify: `server/database.ts`
- Create: `server/sftpStore.ts`
- Test: `server/sftpStore.test.ts`
- Modify: `server/http/support.ts`

- [ ] **Step 1: 写失败测试，锁定 host key 与传输任务恢复能力**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('sftpStore persists host keys and resumable transfer tasks', async () => {
  const { createSftpStore } = await import('./sftpStore.js');
  const store = await createSftpStore();

  await store.upsertHostKey({
    nodeId: 'node-1',
    algorithm: 'ssh-ed25519',
    fingerprint: 'SHA256:abc',
  });

  await store.upsertTransferTask({
    taskId: 'task-1',
    nodeId: 'node-1',
    direction: 'upload',
    localPath: '/tmp/a.txt',
    remotePath: '/root/a.txt',
    tempRemotePath: '/root/.opsclaw-upload-task-1.tmp',
    totalBytes: 1024,
    transferredBytes: 512,
    lastConfirmedOffset: 512,
    chunkSize: 262144,
    status: 'paused',
    retryCount: 1,
    errorMessage: null,
    checksumStatus: 'pending',
  });

  const hostKey = await store.getHostKey('node-1');
  const resumable = await store.listResumableTasks('node-1');

  assert.equal(hostKey?.fingerprint, 'SHA256:abc');
  assert.equal(resumable[0]?.lastConfirmedOffset, 512);
  assert.equal(resumable[0]?.status, 'paused');
});
```

- [ ] **Step 2: 运行测试，确认当前没有 SFTP store**

Run: `pnpm exec tsx --test server/sftpStore.test.ts`

Expected: FAIL，提示 `sftpStore.ts` 不存在。

- [ ] **Step 3: 在数据库里增加 `sftp_host_keys` 与 `sftp_transfer_tasks`**

在 `server/database.ts` 中增加表结构：

```ts
function ensureSftpHostKeysTable(database: SqlDatabaseHandle) {
  database.run(`
    CREATE TABLE IF NOT EXISTS sftp_host_keys (
      node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
      algorithm TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      seen_at TEXT NOT NULL
    );
  `);
}

function ensureSftpTransferTasksTable(database: SqlDatabaseHandle) {
  database.run(`
    CREATE TABLE IF NOT EXISTS sftp_transfer_tasks (
      task_id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      local_path TEXT NOT NULL,
      remote_path TEXT NOT NULL,
      temp_local_path TEXT,
      temp_remote_path TEXT,
      total_bytes INTEGER,
      transferred_bytes INTEGER NOT NULL,
      last_confirmed_offset INTEGER NOT NULL,
      chunk_size INTEGER NOT NULL,
      status TEXT NOT NULL,
      retry_count INTEGER NOT NULL,
      error_message TEXT,
      checksum_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  database.run(`CREATE INDEX IF NOT EXISTS idx_sftp_transfer_tasks_node_id ON sftp_transfer_tasks(node_id);`);
  database.run(`CREATE INDEX IF NOT EXISTS idx_sftp_transfer_tasks_status ON sftp_transfer_tasks(status);`);
}
```

并在数据库初始化时调用它们。

- [ ] **Step 4: 实现 `server/sftpStore.ts` 的最小读写**

```ts
export function createSftpStore() {
  return {
    async getHostKey(nodeId: string) { /* select */ },
    async upsertHostKey(input: {
      nodeId: string;
      algorithm: string;
      fingerprint: string;
    }) { /* insert or replace */ },
    async upsertTransferTask(input: SftpTransferTaskRecordInput) { /* insert or replace */ },
    async listResumableTasks(nodeId: string) {
      return queryMany(
        database,
        `
          SELECT * FROM sftp_transfer_tasks
          WHERE node_id = :nodeId
            AND status IN ('queued', 'running', 'paused', 'retrying')
          ORDER BY updated_at DESC
        `,
        mapTransferTaskRow,
        { ':nodeId': nodeId }
      );
    },
    async deleteTasksForNode(nodeId: string) { /* delete */ },
  };
}
```

在 `server/http/support.ts` 中补依赖类型：

```ts
import { createSftpStore } from '../sftpStore.js';
export type SftpStore = Awaited<ReturnType<typeof createSftpStore>>;
```

- [ ] **Step 5: 重新运行测试，确认基础持久化通过**

Run: `pnpm exec tsx --test server/sftpStore.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交这一层变更**

```bash
git add server/database.ts server/sftpStore.ts server/sftpStore.test.ts server/http/support.ts
git commit -m "feat: add sftp persistence store"
```

## Task 3: 实现独立 SFTP 连接与目录服务

**Files:**
- Create: `server/sftpConnectionManager.ts`
- Create: `server/sftpService.ts`
- Test: `server/sftpService.test.ts`
- Modify: `server/serverApp.ts`

- [ ] **Step 1: 写失败测试，锁定目录浏览与风险操作参数校验**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('sftpService lists a directory and normalizes entries', async () => {
  const { createSftpService } = await import('./sftpService.js');

  const service = createSftpService({
    connectionManager: {
      listDirectory: async () => [
        {
          filename: 'nginx.conf',
          longname: '-rw-r--r-- 1 root root 1024 Apr 13 10:00 nginx.conf',
          attrs: { size: 1024, mtime: 1712973600, mode: 33188 },
        },
      ],
    } as never,
  });

  const result = await service.listDirectory({
    nodeId: 'node-1',
    path: '/etc/nginx',
  });

  assert.equal(result.path, '/etc/nginx');
  assert.equal(result.items[0]?.name, 'nginx.conf');
  assert.equal(result.items[0]?.kind, 'file');
});

test('sftpService refuses empty destructive targets', async () => {
  const { createSftpService } = await import('./sftpService.js');
  const service = createSftpService({ connectionManager: {} as never });

  await assert.rejects(
    () => service.deletePaths({ nodeId: 'node-1', paths: [] }),
    /至少选择一个目标/
  );
});
```

- [ ] **Step 2: 运行测试，确认服务尚不存在**

Run: `pnpm exec tsx --test server/sftpService.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现按 `nodeId` 维度隔离的连接管理器**

在 `server/sftpConnectionManager.ts` 中先实现可替换的连接壳体：

```ts
type ManagedSftpConnection = {
  nodeId: string;
  client: Client;
  sftp: SFTPWrapper;
  connectedAt: number;
  lastUsedAt: number;
};

export function createSftpConnectionManager(input: {
  nodeStore: NodeStore;
  sftpStore: SftpStore;
}) {
  const connections = new Map<string, ManagedSftpConnection>();

  async function getOrCreate(nodeId: string) {
    const existing = connections.get(nodeId);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing;
    }

    const node = input.nodeStore.getNodeWithSecrets(nodeId);
    if (!node) {
      throw new Error('节点不存在。');
    }

    // 先用 ssh2 建连，再校验 host key，再获取 sftp wrapper。
  }

  return {
    getOrCreate,
    async closeNode(nodeId: string) { /* end client */ },
    async listDirectory(nodeId: string, path: string) { /* sftp.readdir */ },
    async stat(nodeId: string, path: string) { /* sftp.stat */ },
  };
}
```

- [ ] **Step 4: 实现 `sftpService` 的最小目录操作**

```ts
export function createSftpService(input: {
  connectionManager: ReturnType<typeof createSftpConnectionManager>;
}) {
  return {
    async listDirectory(args: { nodeId: string; path: string }) {
      const items = await input.connectionManager.listDirectory(args.nodeId, args.path);
      return {
        path: args.path,
        items: items.map((item) => ({
          name: item.filename,
          kind: isDirectoryMode(item.attrs.mode) ? 'directory' : 'file',
          size: item.attrs.size ?? null,
          mtimeMs: item.attrs.mtime ? item.attrs.mtime * 1000 : null,
          permissions: toPermissionString(item.attrs.mode),
        })),
      };
    },
    async createDirectory(args: { nodeId: string; path: string }) { /* mkdir */ },
    async renamePath(args: { nodeId: string; fromPath: string; toPath: string }) { /* rename */ },
    async deletePaths(args: { nodeId: string; paths: string[] }) { /* rm / rmdir */ },
    async getMetadata(args: { nodeId: string; path: string }) { /* stat + preview hint */ },
  };
}
```

并在 `server/serverApp.ts` 中实例化 `sftpStore`、`sftpConnectionManager`、`sftpService`。

- [ ] **Step 5: 重新运行测试，确认目录服务可用**

Run: `pnpm exec tsx --test server/sftpService.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交这一层变更**

```bash
git add server/sftpConnectionManager.ts server/sftpService.ts server/sftpService.test.ts \
  server/serverApp.ts
git commit -m "feat: add sftp connection and directory service"
```

## Task 4: 实现可恢复的传输任务管理器和 SFTP HTTP 路由

**Files:**
- Create: `server/sftpTransferManager.ts`
- Test: `server/sftpTransferManager.test.ts`
- Create: `server/http/sftpRoutes.ts`
- Modify: `server/httpApi.ts`
- Modify: `server/http/support.ts`
- Modify: `server/serverApp.test.ts`

- [ ] **Step 1: 写失败测试，锁定上传 checkpoint、临时文件 rename 和恢复**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

test('transfer manager uploads in chunks and renames temp file after completion', async () => {
  const writes: Array<{ offset: number; size: number }> = [];
  const renames: Array<{ from: string; to: string }> = [];

  const { createSftpTransferManager } = await import('./sftpTransferManager.js');
  const manager = createSftpTransferManager({
    sftpStore: {
      upsertTransferTask: async () => undefined,
    } as never,
    connectionManager: {
      writeFileChunk: async (_nodeId, _path, offset, chunk) => {
        writes.push({ offset, size: chunk.length });
      },
      renamePath: async (_nodeId, fromPath, toPath) => {
        renames.push({ from: fromPath, to: toPath });
      },
    } as never,
  });

  await manager.uploadFile({
    taskId: 'task-1',
    nodeId: 'node-1',
    localPath: '/tmp/demo.txt',
    remotePath: '/root/demo.txt',
    fileBuffer: Buffer.from('hello world'),
    chunkSize: 4,
  });

  assert.deepEqual(
    writes.map((item) => item.offset),
    [0, 4, 8]
  );
  assert.deepEqual(renames, [
    {
      from: '/root/.opsclaw-upload-task-1.tmp',
      to: '/root/demo.txt',
    },
  ]);
});
```

- [ ] **Step 2: 运行测试，确认任务管理器不存在**

Run: `pnpm exec tsx --test server/sftpTransferManager.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现传输任务状态机与断点续传**

在 `server/sftpTransferManager.ts` 中先交付单连接分块传输：

```ts
export function createSftpTransferManager(input: {
  sftpStore: SftpStore;
  connectionManager: ReturnType<typeof createSftpConnectionManager>;
}) {
  return {
    async uploadFile(args: {
      taskId: string;
      nodeId: string;
      localPath: string;
      remotePath: string;
      fileBuffer: Buffer;
      chunkSize: number;
      startOffset?: number;
    }) {
      const tempRemotePath = `${path.posix.dirname(args.remotePath)}/.opsclaw-upload-${args.taskId}.tmp`;
      let offset = args.startOffset ?? 0;

      while (offset < args.fileBuffer.length) {
        const chunk = args.fileBuffer.subarray(offset, offset + args.chunkSize);
        await input.connectionManager.writeFileChunk(args.nodeId, tempRemotePath, offset, chunk);
        offset += chunk.length;
        await input.sftpStore.upsertTransferTask({
          taskId: args.taskId,
          nodeId: args.nodeId,
          direction: 'upload',
          localPath: args.localPath,
          remotePath: args.remotePath,
          tempRemotePath,
          totalBytes: args.fileBuffer.length,
          transferredBytes: offset,
          lastConfirmedOffset: offset,
          chunkSize: args.chunkSize,
          status: offset >= args.fileBuffer.length ? 'running' : 'running',
          retryCount: 0,
          errorMessage: null,
          checksumStatus: 'pending',
        });
      }

      await input.connectionManager.renamePath(args.nodeId, tempRemotePath, args.remotePath);
    },
  };
}
```

- [ ] **Step 4: 增加 HTTP 路由并接入 `server/httpApi.ts`**

在 `server/http/sftpRoutes.ts` 中注册这些最小接口：

```ts
app.get('/api/nodes/:id/sftp/list', async (request, response) => {
  const path = typeof request.query.path === 'string' && request.query.path.trim()
    ? request.query.path.trim()
    : '.';
  response.json(await sftpService.listDirectory({ nodeId: request.params.id, path }));
});

app.post('/api/nodes/:id/sftp/directories', async (request, response) => {
  const path = readRequiredString(request.body, 'path', '目录路径');
  response.status(201).json(await sftpService.createDirectory({ nodeId: request.params.id, path }));
});

app.get('/api/nodes/:id/sftp/tasks', async (_request, response) => {
  response.json({ items: await sftpStore.listResumableTasks(_request.params.id) });
});
```

在 `server/httpApi.ts` 中注册：

```ts
registerSftpRoutes(app, dependencies);
```

- [ ] **Step 5: 用 `serverApp.test.ts` 锁定路由已注册并可返回列表**

```ts
void test('server app exposes sftp list route', async () => {
  const { app } = await createOpsClawServerApp();
  const response = await supertest(app).get('/api/nodes/node-1/sftp/list?path=/');
  assert.notEqual(response.status, 404);
});
```

- [ ] **Step 6: 重新运行后端测试**

Run: `pnpm exec tsx --test server/sftpTransferManager.test.ts server/serverApp.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交这一层变更**

```bash
git add server/sftpTransferManager.ts server/sftpTransferManager.test.ts \
  server/http/sftpRoutes.ts server/httpApi.ts server/http/support.ts \
  server/serverApp.test.ts
git commit -m "feat: add resumable sftp transfer routes"
```

## Task 5: 建立 workbench 主视图状态与 SFTP 前端 API / 模型

**Files:**
- Create: `src/features/workbench/sftpApi.ts`
- Create: `src/features/workbench/sftpModel.ts`
- Test: `src/features/workbench/sftpModel.test.ts`
- Create: `src/features/workbench/workbenchPrimaryViewModel.ts`
- Test: `src/features/workbench/workbenchPrimaryViewModel.test.ts`
- Create: `src/features/workbench/useWorkbenchPrimaryView.ts`
- Modify: `src/features/workbench/types.ts`
- Modify: `src/routes/WorkbenchPage.tsx`
- Modify: `src/features/workbench/TerminalWorkspace.tsx`
- Modify: `src/features/workbench/TerminalWorkspaceHeader.tsx`
- Modify: `src/features/workbench/SessionTree.tsx`
- Modify: `src/features/workbench/SessionTreeContextMenu.tsx`

- [ ] **Step 1: 写失败测试，锁定 workbench 主视图在 terminal / sftp 间切换**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOpenSftpViewState,
  closeSftpView,
} from './workbenchPrimaryViewModel.js';

test('buildOpenSftpViewState switches current node to sftp without mutating session selection', () => {
  const result = buildOpenSftpViewState(
    {
      mode: 'terminal',
      nodeId: 'node-1',
      sessionId: 'session-1',
    },
    {
      nodeId: 'node-2',
    }
  );

  assert.deepEqual(result, {
    mode: 'sftp',
    nodeId: 'node-2',
    sessionId: 'session-1',
  });
});

test('closeSftpView falls back to terminal for the last active session node', () => {
  assert.deepEqual(
    closeSftpView({
      mode: 'sftp',
      nodeId: 'node-1',
      sessionId: 'session-1',
    }),
    {
      mode: 'terminal',
      nodeId: 'node-1',
      sessionId: 'session-1',
    }
  );
});
```

- [ ] **Step 2: 运行测试，确认主视图模型尚不存在**

Run: `pnpm exec tsx --test src/features/workbench/workbenchPrimaryViewModel.test.ts src/features/workbench/sftpModel.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 SFTP API 与纯函数模型**

在 `src/features/workbench/types.ts` 中增加：

```ts
export type SftpEntryKind = 'file' | 'directory' | 'symlink';

export type SftpDirectoryEntry = {
  name: string;
  path: string;
  kind: SftpEntryKind;
  size: number | null;
  mtimeMs: number | null;
  permissions: string | null;
  owner: string | null;
  group: string | null;
};

export type SftpDirectoryPayload = {
  nodeId: string;
  path: string;
  items: SftpDirectoryEntry[];
};
```

在 `src/features/workbench/sftpApi.ts` 中实现：

```ts
export async function fetchSftpDirectory(nodeId: string, path: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes/${nodeId}/sftp/list?path=${encodeURIComponent(path)}`);
  return readJson<SftpDirectoryPayload>(response);
}

export async function fetchSftpTasks(nodeId: string) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/nodes/${nodeId}/sftp/tasks`);
  return readJson<{ items: SftpTransferTask[] }>(response);
}
```

在 `src/features/workbench/sftpModel.ts` 中补排序和风险判断：

```ts
export function sortSftpEntries(items: SftpDirectoryEntry[]) {
  return [...items].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

export function classifySftpActionRisk(input: {
  action: 'upload' | 'delete' | 'chmod';
  selectionCount: number;
  overwriting: boolean;
}) {
  if (input.action === 'delete' && input.selectionCount > 1) return 'approval';
  if (input.action === 'upload' && input.overwriting) return 'approval';
  if (input.action === 'chmod') return 'approval';
  return 'direct';
}
```

- [ ] **Step 4: 实现主视图 hook 并在 Workbench 中接入**

```ts
export type WorkbenchPrimaryViewState = {
  mode: 'terminal' | 'sftp';
  nodeId: string | null;
  sessionId: string | null;
};

export function buildOpenSftpViewState(
  current: WorkbenchPrimaryViewState,
  input: { nodeId: string; sessionId?: string | null }
): WorkbenchPrimaryViewState {
  return {
    mode: 'sftp',
    nodeId: input.nodeId,
    sessionId: input.sessionId ?? current.sessionId,
  };
}
```

并在 `src/routes/WorkbenchPage.tsx` 中：

```ts
const primaryView = useWorkbenchPrimaryView({ activeSessionId, sessions });

const openSftpForNodeId = (nodeId: string | null | undefined) => {
  if (!nodeId) return;
  primaryView.openSftp(nodeId);
};
```

让 `TerminalWorkspaceHeader` 与 `SessionTreeContextMenu` 都能调用 `onOpenSftp`。

- [ ] **Step 5: 重新运行前端模型测试**

Run: `pnpm exec tsx --test src/features/workbench/workbenchPrimaryViewModel.test.ts src/features/workbench/sftpModel.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交这一层变更**

```bash
git add src/features/workbench/sftpApi.ts src/features/workbench/sftpModel.ts \
  src/features/workbench/sftpModel.test.ts src/features/workbench/workbenchPrimaryViewModel.ts \
  src/features/workbench/workbenchPrimaryViewModel.test.ts \
  src/features/workbench/useWorkbenchPrimaryView.ts src/features/workbench/types.ts \
  src/routes/WorkbenchPage.tsx src/features/workbench/TerminalWorkspace.tsx \
  src/features/workbench/TerminalWorkspaceHeader.tsx src/features/workbench/SessionTree.tsx \
  src/features/workbench/SessionTreeContextMenu.tsx
git commit -m "feat: add workbench sftp view state"
```

## Task 6: 实现 SFTP 文件管理视图、右侧抽屉与传输队列

**Files:**
- Create: `src/features/workbench/useSftpFileManager.ts`
- Create: `src/features/workbench/SftpFileManagerView.tsx`
- Create: `src/features/workbench/SftpRightDrawer.tsx`
- Create: `src/features/workbench/SftpTransferQueue.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`
- Modify: `src/features/workbench/workbenchLazyPanels.tsx`

- [ ] **Step 1: 写失败测试，锁定抽屉默认 tab 和任务聚合展示**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDefaultSftpDrawerTab,
  buildTransferQueueSummary,
} from './sftpModel.js';

test('buildDefaultSftpDrawerTab prefers preview for files and metadata for directories', () => {
  assert.equal(buildDefaultSftpDrawerTab({ kind: 'file', previewable: true }), 'preview');
  assert.equal(buildDefaultSftpDrawerTab({ kind: 'directory', previewable: false }), 'metadata');
});

test('buildTransferQueueSummary aggregates running and failed tasks', () => {
  const summary = buildTransferQueueSummary([
    { taskId: '1', status: 'running', transferredBytes: 50, totalBytes: 100 },
    { taskId: '2', status: 'failed', transferredBytes: 0, totalBytes: 200 },
  ] as never);

  assert.equal(summary.runningCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.totalBytes, 300);
});
```

- [ ] **Step 2: 运行测试，确认 UI 所需模型还不完整**

Run: `pnpm exec tsx --test src/features/workbench/sftpModel.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 `useSftpFileManager` 状态机**

```ts
export function useSftpFileManager(input: { nodeId: string | null; open: boolean }) {
  const [path, setPath] = useState('/');
  const [directory, setDirectory] = useState<SftpDirectoryPayload | null>(null);
  const [tasks, setTasks] = useState<SftpTransferTask[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'preview' | 'metadata' | 'permissions' | 'tasks'>('metadata');

  const refreshDirectory = useCallback(async () => {
    if (!input.open || !input.nodeId) return;
    setDirectory(await fetchSftpDirectory(input.nodeId, path));
  }, [input.nodeId, input.open, path]);

  const refreshTasks = useCallback(async () => {
    if (!input.open || !input.nodeId) return;
    const payload = await fetchSftpTasks(input.nodeId);
    setTasks(payload.items);
  }, [input.nodeId, input.open]);

  return {
    path,
    directory,
    tasks,
    selectedPaths,
    drawerOpen,
    drawerTab,
    setPath,
    setSelectedPaths,
    setDrawerOpen,
    setDrawerTab,
    refreshDirectory,
    refreshTasks,
  };
}
```

- [ ] **Step 4: 搭建单栏主列表 + 右侧抽屉 UI**

在 `SftpFileManagerView.tsx` 中保持结构轻量：

```tsx
export function SftpFileManagerView(props: {
  nodeId: string;
  onClose: () => void;
}) {
  const model = useSftpFileManager({ nodeId: props.nodeId, open: true });

  return (
    <section className="grid min-h-screen min-w-0 flex-1 grid-cols-[minmax(0,1fr)_360px] bg-[var(--app-bg-elevated)]">
      <div className="min-w-0 border-r border-[var(--app-border-default)]">
        <header className="flex items-center gap-2 border-b border-[var(--app-border-default)] px-4 py-3">
          <button type="button" onClick={() => void model.refreshDirectory()}>刷新</button>
          <button type="button">上传</button>
          <button type="button">下载</button>
          <button type="button">新建目录</button>
        </header>

        <div className="px-4 py-3">
          {/* 文件列表表格 */}
        </div>
      </div>

      <SftpRightDrawer
        open={model.drawerOpen}
        tab={model.drawerTab}
        tasks={model.tasks}
      />
    </section>
  );
}
```

`SftpTransferQueue.tsx` 里只做轻量列表，不要做每个任务一堆本地动画：

```tsx
export function SftpTransferQueue({ tasks }: { tasks: SftpTransferTask[] }) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.taskId} className="rounded-lg border border-[var(--app-border-default)] p-3">
          <div className="text-sm font-medium">{task.remotePath}</div>
          <div className="mt-1 text-xs text-[var(--app-text-secondary)]">
            {task.status} · {task.transferredBytes}/{task.totalBytes ?? 0}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 在 `WorkbenchPage.tsx` 中按主视图切换渲染 terminal 与 SFTP**

```tsx
{primaryView.state.mode === 'sftp' && primaryView.state.nodeId ? (
  <SftpFileManagerView
    nodeId={primaryView.state.nodeId}
    onClose={primaryView.closeSftp}
  />
) : (
  <TerminalWorkspace ... />
)}
```

关键要求：

- 不要在 SFTP 打开时继续挂载一份隐藏的 `TerminalWorkspace`
- 不要为多个节点常驻多个 `SftpFileManagerView`

- [ ] **Step 6: 运行前端模型测试与类型检查**

Run: `pnpm exec tsx --test src/features/workbench/sftpModel.test.ts src/features/workbench/workbenchPrimaryViewModel.test.ts && pnpm typecheck`

Expected: PASS。

- [ ] **Step 7: 提交这一层变更**

```bash
git add src/features/workbench/useSftpFileManager.ts \
  src/features/workbench/SftpFileManagerView.tsx \
  src/features/workbench/SftpRightDrawer.tsx \
  src/features/workbench/SftpTransferQueue.tsx \
  src/routes/WorkbenchPage.tsx src/features/workbench/workbenchLazyPanels.tsx
git commit -m "feat: add sftp file manager view"
```

## Task 7: 用交互卡片承接 SFTP 高风险操作，并完成端到端验证

**Files:**
- Create: `src/features/workbench/sftpActionGateModel.ts`
- Test: `src/features/workbench/sftpActionGateModel.test.ts`
- Modify: `src/features/workbench/InteractionCard.tsx`
- Modify: `src/features/workbench/PendingGatePanel.tsx`
- Modify: `src/features/workbench/SftpFileManagerView.tsx`
- Modify: `src/features/workbench/useSftpFileManager.ts`

- [ ] **Step 1: 写失败测试，锁定覆盖上传和批量删除会生成审批卡片 request**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSftpApprovalRequest,
} from './sftpActionGateModel.js';

test('buildSftpApprovalRequest creates overwrite upload approval card', () => {
  const request = buildSftpApprovalRequest({
    action: 'overwrite_upload',
    nodeName: 'prod-a',
    targetPaths: ['/etc/nginx/nginx.conf'],
  });

  assert.equal(request.interactionKind, 'approval');
  assert.equal(request.title, '确认覆盖上传');
  assert.equal(request.actions[0]?.id, 'approve');
});
```

- [ ] **Step 2: 运行测试，确认 gate 模型还不存在**

Run: `pnpm exec tsx --test src/features/workbench/sftpActionGateModel.test.ts`

Expected: FAIL。

- [ ] **Step 3: 将高风险 SFTP 操作转成本地 approval request**

在 `src/features/workbench/sftpActionGateModel.ts` 中复用 `InteractionRequest` 结构：

```ts
import type { InteractionRequest } from './types.agent';

export function buildSftpApprovalRequest(input: {
  action: 'overwrite_upload' | 'batch_delete' | 'chmod';
  nodeName: string;
  targetPaths: string[];
  chmodValue?: string;
}): InteractionRequest {
  return {
    id: `sftp-${input.action}-${Date.now()}`,
    runId: 'local-sftp',
    sessionId: 'local-sftp',
    interactionKind: 'approval',
    status: 'open',
    title:
      input.action === 'overwrite_upload'
        ? '确认覆盖上传'
        : input.action === 'batch_delete'
          ? '确认批量删除'
          : '确认修改权限',
    message: input.targetPaths.join('\n'),
    riskLevel: 'high',
    blockingMode: 'hard_block',
    openedAt: Date.now(),
    deadlineAt: null,
    showInPendingQueue: false,
    fields: [],
    actions: [
      { id: 'approve', label: '确认执行', kind: 'approve', style: 'primary' },
      { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
    ],
    metadata: {},
  };
}
```

- [ ] **Step 4: 在 `useSftpFileManager` 里接入本地审批流**

```ts
const [pendingApproval, setPendingApproval] = useState<InteractionRequest | null>(null);

const requestDelete = useCallback((paths: string[]) => {
  if (paths.length > 1) {
    setPendingApproval(
      buildSftpApprovalRequest({
        action: 'batch_delete',
        nodeName,
        targetPaths: paths,
      })
    );
    return;
  }

  void deletePathsImmediately(paths);
}, [nodeName]);
```

在 `SftpFileManagerView.tsx` 中直接复用 `InteractionCard`：

```tsx
{model.pendingApproval ? (
  <InteractionCard
    request={model.pendingApproval}
    onSubmit={async (actionId) => {
      if (actionId === 'approve') {
        await model.confirmApproval();
      } else {
        model.dismissApproval();
      }
    }}
  />
) : null}
```

不要把用户侧 SFTP 审批塞进 agent run 的 pending queue；只复用 card 组件与 request 结构。

- [ ] **Step 5: 运行聚焦测试、类型检查与构建验证**

Run:

```bash
pnpm exec tsx --test \
  electron/nativeDialogs.test.ts \
  server/sftpStore.test.ts \
  server/sftpService.test.ts \
  server/sftpTransferManager.test.ts \
  src/features/workbench/sftpModel.test.ts \
  src/features/workbench/workbenchPrimaryViewModel.test.ts \
  src/features/workbench/sftpActionGateModel.test.ts
pnpm typecheck
pnpm desktop:build:electron
```

Expected:

- 所有新增聚焦测试 PASS
- `pnpm typecheck` PASS
- `pnpm desktop:build:electron` PASS

- [ ] **Step 6: 提交这一层变更**

```bash
git add src/features/workbench/sftpActionGateModel.ts \
  src/features/workbench/sftpActionGateModel.test.ts \
  src/features/workbench/InteractionCard.tsx \
  src/features/workbench/PendingGatePanel.tsx \
  src/features/workbench/SftpFileManagerView.tsx \
  src/features/workbench/useSftpFileManager.ts
git commit -m "feat: add sftp action approval cards"
```

## Self-Review

### Spec coverage

- 节点级独立 SFTP runtime：Task 3, Task 5, Task 6
- 单栏远端文件管理器 + 右侧抽屉：Task 6
- 原生文件选择器上传/下载：Task 1, Task 6
- 独立传输队列：Task 4, Task 6
- 分块传输、checkpoint、断点续传：Task 2, Task 4
- host key 校验：Task 2, Task 3
- 高风险操作审批：Task 7
- 性能约束，不复制 terminal 常驻多实例问题：Task 5, Task 6

### Placeholder scan

- 没有遗留占位符或模糊执行描述
- 所有任务都给出了明确文件路径、测试入口与最小代码骨架

### Type consistency

- 前后端统一使用 `SftpTransferTask` / `SftpDirectoryPayload` / `InteractionRequest`
- workbench 主视图固定为 `terminal | sftp`
- 用户侧审批不混入 agent run 队列，只复用 `InteractionCard`
