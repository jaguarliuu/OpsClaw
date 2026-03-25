# CLAUDE.md

OpsClaw — SSH 运维工作台。React 19 前端 + Express 5 后端，通过 REST 管理节点/分组，通过 WebSocket 维持 SSH 终端会话。所有用户界面文字使用简体中文。

---

## Commands

```bash
pnpm dev              # 同时启动前端 :5173 + 后端 :4000
pnpm dev:client       # 仅 Vite 前端
pnpm dev:server       # tsx watch server/index.ts
pnpm build            # tsc -b && tsc -p tsconfig.server.json && vite build
pnpm typecheck        # 类型检查（不生成产物），每次改动后必须通过
pnpm lint             # ESLint
pnpm start:server     # node dist-server/index.js
```

包管理器：**pnpm**（v8.12.1）。暂无测试命令。

---

## Architecture

### 目录结构

```
src/                          # 前端
├── app/
│   ├── AppLayout.tsx         # 根布局，包裹 TerminalSettingsProvider
│   └── router.tsx            # React Router 7 路由定义
├── routes/                   # 页面级组件
│   └── WorkbenchPage.tsx     # 主页面（~800 行），拥有全部 workbench 状态
├── features/workbench/       # 所有 workbench 功能模块
│   ├── api.ts                # fetch 函数，对应后端 REST 接口
│   ├── types.ts              # 前端共用类型定义
│   ├── SessionTree.tsx       # 左侧连接管理器
│   ├── SshTerminalPane.tsx   # 单个 SSH 终端面板（xterm.js）
│   ├── TerminalWorkspace.tsx # 终端区域布局（Tab + 分屏）
│   ├── ConnectionPanel.tsx   # 右侧连接配置面板
│   ├── QuickConnectModal.tsx # Cmd+K 快速连接弹窗
│   ├── GroupDialogs.tsx      # 分组新建/重命名/移动弹窗
│   ├── TerminalSettingsContext.tsx  # 终端设置 React Context
│   ├── TerminalSettingsPanel.tsx   # 终端设置面板
│   ├── terminalSettings.ts   # 主题定义 + localStorage 读写
│   ├── terminalSocket.ts     # WebSocket URL 构造
│   ├── useKeyboardShortcuts.ts     # 全局键盘快捷键 hook
│   └── data.ts               # UI 开发用 mock 数据
├── components/ui/            # shadcn/ui 组件（勿手动修改）
└── lib/
    ├── utils.ts              # cn() Tailwind 工具函数
    └── serverBase.ts         # 环境感知的后端 URL

server/                       # 后端
├── index.ts                  # Express + WebSocket 服务器，所有路由，SSH 会话生命周期
├── nodeStore.ts              # 节点/分组 CRUD（sql.js SQLite）
├── database.ts               # Schema 初始化 + 迁移
└── secretVault.ts            # AES-256-GCM 凭证加密

data/
├── opsclaw.sqlite            # SQLite 数据库
└── opsclaw.master.key        # 自动生成的加密主密钥
```

### 关键链路

- **前端 → 后端 REST**：`src/features/workbench/api.ts` → `server/index.ts` `/api/*` 路由
- **终端 WebSocket**：`SshTerminalPane.tsx` ↔ `server/index.ts` WebSocket handler
- **Dev 代理**：Vite 将 `/api` 代理到 `:4000`，`/ws` 代理到 `ws://localhost:4000`，前端始终用相对路径

### tsconfig 多配置

| 文件 | 用途 |
|------|------|
| `tsconfig.app.json` | 前端（ESNext 模块，JSX，noEmit） |
| `tsconfig.server.json` | 后端（NodeNext 模块，输出到 `dist-server/`） |
| `tsconfig.node.json` | 构建工具 |
| `tsconfig.json` | 复合根，引用以上三个 |

---

## Frontend Conventions

### 状态管理

- **无全局状态库**（无 Redux/Zustand）。`WorkbenchPage.tsx` 拥有全部 workbench 状态，通过 props 向下传递，通过回调向上通知。
- 状态包括：`sessions`、`activeSessionId`、`savedProfiles`、`savedGroupRecords`、`nodeOnlineStatus`、各种 `isLoading`/`error`/`pending` 状态。
- **API 响应需经 mapper 函数转换**再存入状态，不直接存原始 API 类型：
  ```ts
  mapNodeToProfile(node: NodeSummaryRecord): SavedConnectionProfile
  mapNodeDetailToFormValues(node: NodeDetailRecord): ConnectionFormValues
  buildGroupTree(groupRecords, profiles): SavedConnectionGroup[]
  ```

### 组件结构

- 全部使用**函数组件 + hooks**，无 class 组件。
- 需要暴露命令式 API 时使用 `forwardRef` + `useImperativeHandle`：
  ```ts
  export type SshTerminalPaneHandle = { clear(): void; sendCommand(cmd: string): void; }
  export const SshTerminalPane = forwardRef<SshTerminalPaneHandle, Props>(
    function SshTerminalPane({ session, active, show }, ref) { ... }
  );
  ```
- **大量使用 `useRef`** 避免闭包陈旧值，或追踪不触发渲染的状态：
  - DOM 引用：`containerRef`, `terminalRef`
  - 行为标志：`intentionalCloseRef`, `reconnectAttemptRef`, `everConnectedRef`
  - 回调稳定化：`onStatusChangeRef`, `handlersRef`
- **Context 模式**（见 `TerminalSettingsContext.tsx`）：
  ```ts
  const Ctx = createContext<Value | null>(null);
  export function Provider({ children }) { ... }
  export function useCtx() {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('must be inside Provider');
    return ctx;
  }
  ```

### 类型规范

- 联合类型用于消息协议中的判别联合：
  ```ts
  type ServerMessage =
    | { type: 'data'; payload: string }
    | { type: 'status'; payload: { state: 'connected' | 'closed' } }
    | { type: 'error'; payload: { message: string } };
  ```
- 可空字段显式写 `string | null`，不用 `string?`（数据库层保持一致）。
- 类型定义集中在 `types.ts`（前端共用）或各 feature 文件内（局部类型）。
- `import type { ... }` 与值 import 分开写。

### 样式规范

- **Tailwind CSS 4**，通过 `@tailwindcss/vite` 插件。
- **色板**：
  - 背景层级：`bg-[#111214]` → `bg-[#141519]` → `bg-[#17181b]` → `bg-[#1e2025]`
  - 文字：`text-neutral-100`（主）/ `text-neutral-400`（次）/ `text-neutral-600`（弱）
  - 强调色：`blue-500` / `blue-600`；成功：`emerald-500`；警告：`amber-400`；危险：`red-300` / `red-500`
  - 边框：`border-neutral-800`（常规）/ `border-neutral-700`（强调）
- `cn()` 函数用于条件类组合（来自 `@/lib/utils`）：
  ```ts
  cn('base-classes', isActive && 'active-classes', className)
  ```
- shadcn 组件使用 CVA（Class Variance Authority）定义变体，不在业务代码中直接写 variant 逻辑。
- 不写独立 CSS 文件，全部用 Tailwind 工具类。

### API 调用规范

`src/features/workbench/api.ts` 统一管理所有 REST 调用：

```ts
// 错误处理统一用 readJson<T>()
async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(payload.message ?? '请求失败。');
  return payload;
}

// 响应格式约定
{ item: T }          // 单个资源
{ items: T[] }       // 列表资源
{ message: string }  // 错误
```

- URL 通过 `buildServerHttpBaseUrl()` 构造，自动适配 dev/prod 环境。
- 不直接调用 `fetch`，统一封装成具名函数（`fetchNodes`, `createNode`, `deleteGroup` 等）。

### WebSocket 终端协议

```ts
// 客户端 → 服务端
{ type: 'connect'; payload: { nodeId?, host, port, username, password?, privateKey?, passphrase?, cols, rows } }
{ type: 'input';   payload: string }
{ type: 'resize';  payload: { cols: number; rows: number } }

// 服务端 → 客户端
{ type: 'status'; payload: { state: 'connecting' | 'connected' | 'closed' } }
{ type: 'data';   payload: string }
{ type: 'error';  payload: { message: string } }
```

### 键盘快捷键

`useKeyboardShortcuts` hook（`src/features/workbench/useKeyboardShortcuts.ts`）：
- Mac 用 `metaKey`，Windows/Linux 用 `ctrlKey`，自动检测
- 在 `INPUT`/`TEXTAREA`/`SELECT` 聚焦时不触发
- 用 `handlersRef` 稳定化回调，避免 listener 反复注册

| 快捷键 | 功能 |
|--------|------|
| Cmd+K  | 快速连接面板 |
| Cmd+W  | 关闭当前 Tab |
| Cmd+T  | 新建连接 |
| Cmd+[  | 上一个 Tab |
| Cmd+]  | 下一个 Tab |
| Cmd+1~9 | 跳到第 N 个 Tab |

### 本地化

- **所有用户可见字符串使用简体中文**：错误提示、标签、占位符、验证文案、按钮文字。
- 纯技术性的代码注释可用英文，但 UI 文案必须中文。

---

## Backend Conventions

### 路由规范

- 遵循 RESTful 惯例：`GET /api/nodes`、`POST /api/nodes`、`PUT /api/nodes/:id`、`DELETE /api/nodes/:id`
- **具体路径必须在参数化路径之前注册**：`/api/nodes/ping-all` 必须在 `/api/nodes/:id` 之前，否则会被吞掉。
- 响应格式统一：单资源 `{ item }` / 列表 `{ items }` / 无内容 `204` / 错误 `{ message }`

### 错误处理

```ts
class RequestError extends Error {
  constructor(readonly statusCode: number, message: string) { ... }
}

// 路由 try/catch 模板
try {
  // 业务逻辑
  response.json({ item: result });
} catch (error) {
  if (error instanceof RequestError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error(error);
  response.status(500).json({ message: '操作失败。' });
}
```

### 输入验证

使用 `readRequiredString` / `readOptionalString` / `readPort` 等统一验证函数，抛出 `RequestError(400, ...)` 携带中文提示。

### WebSocket SSH 会话

- 每个 WebSocket 连接独立维护：`sshClient`、`jumpSshClient`（跳板机）、`shellChannel`
- **8ms 批量窗口**（`setTimeout(flushTerminalData, 8)`）合并高频 terminal data 减少消息数
- **30s 心跳**（`setInterval` + `websocket.ping()`）检测僵尸连接
- 会话结束时必须执行 `cleanup()`：清理定时器、关闭 SSH client、移除所有监听器

### 自动重连逻辑（前端）

```
delays = [1000, 2000, 4000, 8000, 16000] ms，最多 5 次
intentionalCloseRef = true  →  不重连（用户主动关闭）
everConnectedRef = false     →  不重连（初始连接从未成功）
```

---

## Database Conventions

### SQLite via sql.js

- sql.js 使用 WASM，**不是** better-sqlite3，API 有差异
- **命名参数**：SQL 中用 `:colon` 前缀，params 对象中用 `{ ':key': value }`
- **持久化**：`database.export()` → `fs.writeFile()`，通过串行 Promise 队列（`persistQueue`）防并发写

### Schema 与迁移

```ts
// 迁移模式：先读现有列，按需 ALTER TABLE
const result = database.exec('PRAGMA table_info(nodes);');
const existingColumns = new Set(result[0]?.values.map(row => row[1]));
if (!existingColumns.has('jump_host_id')) {
  database.run('ALTER TABLE nodes ADD COLUMN jump_host_id TEXT;');
}
```

- 新增列时**始终使用此模式**，不能直接 `ALTER TABLE`（运行中的实例可能有旧 schema）。
- 时间戳存为 ISO 8601 字符串（`new Date().toISOString()`），不存 Unix timestamp。

### 查询模式

```ts
// 通用查询工具
queryMany<T>(db, sql, mapRow, params): T[]
queryOne<T>(db, sql, mapRow, params): T | null

// Row mapper 函数：SqlRow → 业务类型
function mapNodeSummary(row: SqlRow): StoredNodeSummary { ... }
function mapNodeDetail(row: SqlRow): StoredNodeDetail { ... }  // 含解密
```

### 加密规范

- 凭证（password / privateKey / passphrase）存储前必须加密，读取后立即解密，业务层只接触明文。
- AES-256-GCM，12 字节随机 IV，16 字节 AuthTag，格式：`opsclaw:v1:<base64(iv+authTag+ciphertext)>`
- 版本前缀 `opsclaw:v1:` 用于未来迁移识别；旧版无前缀的明文值在读取时原样返回（向后兼容）。
- 主密钥优先级：`OPSCLAW_MASTER_KEY` 环境变量 → `data/opsclaw.master.key` 文件 → 自动生成并写入文件（权限 `0o600`）

---

## Logging Conventions

### 当前约定（极简）

```ts
// 服务启动
console.log(`OpsClaw SSH gateway listening on http://localhost:${port}`);

// 路由层未预期错误（RequestError 不打印，直接返回给客户端）
console.error(error);
```

### 新功能日志规范

1. **禁止在日志中输出凭证**：password / privateKey / passphrase / master key 一律不打印。
2. **结构化前缀**：格式 `[module] message`：
   - `[nodeStore] createNode: id=xxx`
   - `[ws] session open: nodeId=xxx`
   - `[ws] session error: nodeId=xxx reason=xxx`
3. **错误日志带上下文**：`console.error('[module] failed', { nodeId, error })`
4. **前端不保留 `console.log`**：仅调试临时使用，提交前清理；`console.error` 可保留。

---

## Feature Development Checklist

新增功能时须遵守：

1. **类型先行**：先在 `types.ts` 或对应模块定义类型，再写实现。
2. **后端 Schema 变更**：新增表/列必须走迁移模式（`PRAGMA table_info` + 条件 `ALTER TABLE`），同步更新本文件。
3. **API 函数**：后端新路由在 `api.ts` 增加对应 fetch 函数，命名：`fetchXxx` / `createXxx` / `updateXxx` / `deleteXxx`。
4. **路由顺序**：具体路径（`/api/commands/search`）必须注册在参数化路径（`/:id`）之前。
5. **中文文案**：用户可见的所有提示、标签、错误必须用简体中文。
6. **凭证安全**：新增敏感字段必须经 `secretVault.encrypt()` 存储，日志中不出现明文。
7. **类型检查**：每次改动后运行 `pnpm typecheck` 确保通过。
8. **依赖克制**：能用已有库解决的不新增 npm 包。

---

## Completed Features

| 阶段 | 功能 |
|------|------|
| Phase 1 | SSH 自动重连（指数退避）、Cmd+K 快速连接面板 |
| Phase 2 | 终端设置（5 主题）、localStorage 持久化、全局键盘快捷键 |
| Phase 3 | 跳板机支持（ssh2 `forwardOut`）、节点在线状态（TCP ping + 30s 轮询） |
| Phase 4 | 终端内搜索（Ctrl+F）、侧边栏节点过滤、多行粘贴确认 |
| Phase 5 | 分屏（左右/上下，可拖拽分隔线，绝对定位保持连接不断）、右键菜单视口修复 |

---

## Known Gotchas

- **Express 路由顺序**：具体路径（`/ping-all`）必须在参数化路径（`/:id`）之前注册。
- **sql.js 参数格式**：SQL 中 `:key`，params 对象中 `{ ':key': value }`（含冒号）。
- **`useKeyboardShortcuts` 调用时机**：必须在所有被引用的 handler 函数定义之后调用（TDZ）。
- **分屏绝对定位**：所有 `SshTerminalPane` 始终挂载（保持 WebSocket 连接），CSS absolute 切换可见性，不销毁重建。
- **sql.js 不是 better-sqlite3**：API 完全不同，不可混用文档。