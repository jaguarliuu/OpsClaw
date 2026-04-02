# Electron Desktop Integration Design

## Goal

为 OpsClaw 增加第一版桌面端交付能力，在尽量不改动现有业务架构的前提下，把当前 React + 本地 Node backend + SSH gateway 组合封装为可运行、可打包、可分发的 Electron 桌面应用。

首版目标不是“重新设计架构”，而是把当前已经稳定的核心能力安全地放进桌面壳里：

- 工作台 UI
- 本地 API 服务
- WebSocket 终端网关
- SQLite 数据
- LLM / Agent / 脚本库能力

## Why Electron

当前项目天然更适合 Electron，而不是 Tauri：

- 服务端已经是标准 Node 进程入口，见 `server/index.ts`
- 运行时强依赖 `express`、`ws`、`ssh2`、`sql.js`
- 前端当前通过 Vite 代理本地 `http://localhost:4000` 和 `ws://localhost:4000`
- 大量逻辑默认运行在 Node 环境，不是纯前端壳

如果使用 Tauri，首版仍然需要 sidecar 或外部二进制来托管现有 backend，这会额外引入：

- sidecar 打包与路径管理
- shell/plugin 权限配置
- 多平台 sidecar 生命周期编排

因此首版桌面化优先选 Electron。等桌面版本稳定、后端边界更清楚后，再评估是否值得迁移到 Tauri。

## Scope

本次桌面化设计只覆盖 V1 能力：

- Electron 主进程接入
- 启动并托管现有 Node backend
- 开发态 / 生产态双模式运行
- 本地静态资源加载
- SQLite / 日志 / 配置写入桌面用户目录
- 桌面应用构建与 macOS 打包
- backend 启动失败的最小提示
- 单实例控制

本次不包含：

- 自动更新
- 系统托盘
- 深度原生菜单定制
- Windows 安装器优化
- macOS 签名、公证
- 沙盒化重构
- 把 backend 改写为 Electron main 内嵌模块

## Existing Constraints

当前代码里有三类桌面化前必须收口的约束：

### 1. 固定端口假设

`src/features/workbench/serverBase.ts` 当前默认假设本地 backend 在 `4000` 端口，桌面环境里这个假设不可靠：

- 端口可能被占用
- 同机可能跑多份开发实例
- 打包后不能要求用户预先释放端口

桌面版必须支持运行时分配 backend 端口，并把最终 base URL 注入 renderer。

### 2. 数据路径绑定 `process.cwd()`

`server/database.ts` 当前 SQLite 文件固定写到：

- `process.cwd()/data/opsclaw.sqlite`

桌面应用中 `cwd` 不稳定，也不适合作为用户数据目录。桌面版必须改为使用明确的数据根目录，并默认落到 Electron `app.getPath('userData')`。

### 3. backend 生命周期由 CLI 入口直接驱动

`server/index.ts` 当前是直接 `listen(port)` 的 CLI 入口。桌面版需要让 Electron main 成为真正的宿主：

- 启动 backend
- 探测 health ready
- 失败时上报
- 应用退出时清理

因此 backend 启动逻辑要从“纯 CLI”调整为“可被外部托管的 server entry”。

## Architecture

桌面版采用三层运行结构：

### 1. Electron Main Process

职责：

- 应用生命周期管理
- 单实例控制
- 创建 BrowserWindow
- 启动/停止 backend 子进程
- 为 renderer 注入 runtime config
- 处理 backend 启动失败

建议新增：

- `electron/main.ts`
- `electron/window.ts`
- `electron/backendProcess.ts`
- `electron/preload.ts`
- `electron/constants.ts`

### 2. Backend Child Process

职责：

- 复用现有 `server/` 目录全部能力
- 对外提供 HTTP API 和 `/ws/terminal`
- 管理 SQLite、SSH、Agent、LLM 等本地运行时

实现方式：

- 生产态由 Electron main 启动 `dist-server/index.js`
- 开发态优先复用同一套 Electron 控制逻辑，直接启动 `tsx server/index.ts` 或编译后的 server entry

### 3. Renderer

职责：

- 继续承载现有 React/Vite UI
- 所有 HTTP 和 WS 请求通过 runtime-injected backend base URL 访问

要求：

- 不能再假定 backend 固定在 `localhost:4000`
- 不能让 renderer 自己猜测端口

## Backend Hosting Model

### Preferred Model

Electron main 通过 `child_process.spawn` 托管 backend 进程。

推荐原因：

- 与当前 `server/index.ts` 结构兼容性最好
- 隔离 Node backend 与 Electron main 的崩溃域
- 便于独立重启、日志采集、ready 探测

### Startup Flow

1. Electron main 启动
2. 确定用户数据目录
3. 分配一个本地可用端口
4. 以环境变量方式启动 backend 子进程
5. 轮询 `/api/health`，直到 ready
6. 创建窗口并向 renderer 暴露 backend runtime config

### Shutdown Flow

1. Electron 收到退出事件
2. 先请求 backend 优雅退出
3. 超时后再强制 kill
4. 再关闭 BrowserWindow / App

### Required Environment Variables

建议由 Electron 注入：

- `PORT`
- `OPSCLAW_DATA_DIR`
- `OPSCLAW_DESKTOP=1`
- `OPSCLAW_SERVER_HTTP_URL`
- `OPSCLAW_MASTER_KEY`（若后续仍需）

其中：

- `OPSCLAW_DATA_DIR` 用于统一 SQLite、日志、后续缓存目录
- `PORT` 必须是运行时动态端口

## Data & File System Design

桌面版统一使用 Electron 用户目录：

- `app.getPath('userData')`

建议目录布局：

- `<userData>/data/opsclaw.sqlite`
- `<userData>/logs/backend.log`
- `<userData>/logs/main.log`
- `<userData>/cache/`

服务端需要新增一个“数据目录解析层”，避免在多个文件里重复写 `process.cwd()` 推导。

建议新增：

- `server/runtimePaths.ts`

负责提供：

- `getOpsClawDataDir()`
- `getOpsClawDatabaseFilePath()`
- 后续日志 / cache 路径

迁移原则：

- 若显式提供 `OPSCLAW_DATA_DIR`，优先使用
- 否则回退到当前开发环境默认路径

这样开发态与桌面态可以共存。

## Frontend Runtime Config

当前 `src/features/workbench/serverBase.ts` 有固定端口推断逻辑。桌面化后应调整为：

优先级：

1. Electron preload 注入的 runtime config
2. `import.meta.env`
3. 浏览器默认 origin 推导

建议 preload 暴露：

- `window.__OPSCLAW_RUNTIME__ = { serverHttpBaseUrl, serverWebSocketBaseUrl, desktop: true }`

然后 `serverBase.ts` 改为读取：

- `window.__OPSCLAW_RUNTIME__.serverHttpBaseUrl`
- `window.__OPSCLAW_RUNTIME__.serverWebSocketBaseUrl`

这样：

- 开发态仍可使用 Vite env
- 生产态由 Electron 统一注入

## Build & Packaging

建议工具：

- `electron`
- `electron-builder`

### Build Outputs

需要三个产物：

1. 前端静态资源
   - `dist/`
2. 服务端编译产物
   - `dist-server/`
3. Electron main/preload 编译产物
   - `dist-electron/`

### Suggested Scripts

- `desktop:dev`
  - 启动 Electron 开发模式
- `desktop:build`
  - 构建前端、服务端、electron main
- `desktop:pack`
  - 生成本地可运行安装包

### Production Loading Strategy

生产态 Electron renderer 直接加载本地 `dist/index.html`。

不要在生产态继续依赖 Vite dev server，也不要让 BrowserWindow 加载线上 URL。

## UX Requirements

### Startup

首版启动体验要求：

- backend ready 前，不展示残缺工作台
- 可以展示一个轻量 loading 窗口或 loading overlay
- backend 启动失败时，给出明确错误，而不是空白窗口

### Failure States

至少覆盖：

- backend 端口占用 / 启动失败
- backend health 超时
- preload 注入失败

表现形式：

- 桌面错误对话框或启动失败页
- 保留可复制的错误摘要

### Single Instance

桌面应用启用单实例控制：

- 第二次打开时激活已有窗口
- 不允许两个 Electron 主进程争用同一份用户数据目录

## Security Baseline

首版不做大规模安全重构，但 Electron 基线要到位：

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer 不直接暴露 Node API
- 通过 preload 暴露最小桌面 runtime config

首版 renderer 不需要直接调用大量 Electron API，只需要读 runtime config 即可。

## Testing Strategy

### Unit

新增模型/工具测试：

- backend process env 构建
- runtime path 解析
- frontend server base 解析

### Integration

新增桌面集成测试重点：

- Electron main 能启动 backend
- backend ready 后 renderer base URL 正确
- 动态端口不会破坏终端 WebSocket

### Manual Regression

桌面化后至少人工回归：

- SSH 连接
- 终端输入 / 回显
- 分屏
- AI 助手
- 脚本库执行
- 应用关闭后 backend 是否退出
- 重启后 SQLite 数据是否保留

## Rollout Plan

建议分三阶段：

### Phase 1: Runtime Refactor

- 提取 server runtime path
- backend 支持动态 `PORT`
- frontend 支持 runtime-injected backend base URL

### Phase 2: Electron Shell

- 接入 Electron main / preload
- 托管 backend 子进程
- 跑通 dev 模式

### Phase 3: Packaging

- 接入 electron-builder
- 跑通 macOS 包
- 做桌面稳定化回归

## Risks

### 1. Fixed-port assumptions remain in scattered code

即使改了 `serverBase.ts`，如果还有别处直接写死 `4000`，生产桌面版仍会失败。

### 2. Backend starts but renderer loads too早

如果 BrowserWindow 先打开、backend 后 ready，前端会出现初始化错误和空白请求失败。

### 3. `userData` path migration不完整

如果 SQLite 改了，但日志、密钥、后续缓存仍走旧路径，桌面版会出现状态分裂。

### 4. Process cleanup不干净

若 Electron 退出时未清理 backend，可能遗留孤儿进程，占用端口和数据文件。

## Recommendation

采用以下落地策略：

- Electron
- backend 继续保持独立 Node 进程
- 动态端口 + preload runtime config
- `userData` 目录托管所有桌面数据
- 先交付 macOS 可运行包，再继续做签名、公证和自动更新

这条路径对当前项目侵入最小、成功率最高，也最适合先把桌面版 V1 稳定交付出来。
