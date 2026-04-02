# OpsClaw

OpsClaw 是一个面向桌面端的 AI 原生运维工作台。

它把 SSH 会话、AI Chat、Agent 执行、脚本库、命令历史、节点记忆和桌面打包整合到同一个工作区里，目标是让后续功能都建立在稳定的 AI + SSH 底座之上，而不是分散成多个孤立工具。

## 当前能力

- SSH 节点与分组管理
- 终端会话管理、命令执行、历史记录与搜索建议
- AI Chat 流式对话
- AI Agent 基于 ReAct 的多步执行
- Agent 命令取消、会话锁释放、交互式命令人工接管续跑
- LLM 提供商配置
  - 内置 provider 候选
  - OpenAI-compatible / 自定义 provider
  - 可自定义 `baseUrl`
  - 可维护模型候选并手填模型名
- 节点 / 全局记忆（`MEMORY.md`）
- 全局脚本库 + 节点覆盖脚本
- Electron 桌面端集成与 Windows 打包

## 技术栈

- 前端：React 19、TypeScript、Vite、Tailwind CSS 4、Radix UI、xterm.js
- 服务端：Express、WebSocket、ssh2、sql.js
- AI：`@mariozechner/pi-ai`
- 桌面端：Electron、electron-builder
- 包管理：pnpm

## 运行方式

### 1. 安装依赖

```bash
pnpm install
```

### 2. Web 开发模式

```bash
pnpm dev
```

默认会同时启动：

- Vite 前端：`http://localhost:5173`
- Node 服务端：`http://localhost:4000`

### 3. 桌面端开发模式

```bash
pnpm desktop:dev
```

这会先编译 Electron 主进程，再启动前端开发服务器和桌面壳。

### 4. 生产构建

```bash
pnpm build
pnpm desktop:build
```

### 5. Windows 打包

```bash
pnpm desktop:pack:win
```

默认产物：

- `release/OpsClaw-0.1.0-win.zip`
- `release/win-unpacked/`

## 常用命令

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm desktop:dev
pnpm desktop:pack:win
```

## 项目结构

```text
.
├─ electron/                  # Electron 主进程、预加载、日志与窗口逻辑
├─ server/                    # Express API、SSH 网关、Agent runtime、数据存储
│  ├─ agent/                  # Agent、工具注册、会话锁、记忆沉淀
│  └─ http/                   # 各 HTTP 路由模块
├─ src/
│  ├─ app/                    # App shell、路由、主题变量注入
│  ├─ components/             # 通用 UI 组件
│  ├─ features/workbench/     # 工作台主功能
│  ├─ routes/                 # 页面级路由
│  └─ styles/                 # 全局样式与 Markdown / xterm 主题
├─ docs/superpowers/          # 设计文档与实现计划
└─ release/                   # 本地打包产物（不建议入库）
```

## 核心模块

### 工作台

主工作区在 [`src/routes/WorkbenchPage.tsx`](./src/routes/WorkbenchPage.tsx) 和 [`src/features/workbench`](./src/features/workbench)。

当前结构已经做过一轮拆分，重点职责分别收口到：

- `useWorkbenchWorkspaceData`：工作区加载 / refresh / polling
- `SshTerminalPane` + 一组 `useSshTerminal*` hooks：终端连接、运行时、搜索、viewport、命令执行
- `SessionTree*`：会话树 UI、filter、context menu、header/search/footer
- `AiAssistantPanel`：Chat / Agent 面板
- `ScriptLibraryPanel`：脚本库
- `LlmSettings`：LLM 配置中心

### 服务端

服务入口在 [`server/serverApp.ts`](./server/serverApp.ts)。

主要组成：

- `nodeStore`：节点 / 分组数据
- `commandHistoryStore`：命令历史
- `llmProviderStore`：模型提供商配置
- `scriptLibraryStore`：脚本库
- `SessionRegistry`：SSH 会话注册、转录与 Agent 命令锁
- `OpsAgentRuntime`：Agent 执行循环
- `registerOpsClawHttpApi`：HTTP API 注册
- `registerTerminalGateway`：SSH WebSocket 网关

### Agent

Agent 相关代码在 [`server/agent`](./server/agent)。

当前内置工具包括：

- `session.list`
- `session.get_metadata`
- `session.read_transcript`
- `session.run_command`
- 文件记忆相关工具

已经处理的关键稳定性问题包括：

- Agent / Chat 停止时的中断链路
- `run_failed` 错误透传
- 会话锁未释放导致的 busy 假死
- 交互式命令等待用户输入时的人工接管续跑
- 人工输入回显脱敏，避免敏感内容进入 Agent 结果

## 数据与运行时文件

默认数据目录逻辑在 [`server/runtimePaths.ts`](./server/runtimePaths.ts)：

- 默认使用当前工作目录
- 数据库存放在 `data/opsclaw.sqlite`
- 主密钥文件在 `data/opsclaw.master.key`
- 记忆目录在 `data/memory/`

可以通过环境变量覆盖：

```bash
OPSCLAW_DATA_DIR=/path/to/runtime-data
```

桌面端运行时会把后端放到独立子进程中启动，日志由 Electron 主进程和 backend 分别写入用户数据目录。

## 开发约定

### 前端

- 主题颜色优先使用 `--app-bg-*`、`--app-text-*`、`--app-border-*`
- 避免在工作台里继续扩散深色主题硬编码
- 复杂组件优先拆成 model / hook / presentational component

### 服务端

- Agent 能力尽量围绕稳定的 `session.run_command`、记忆、脚本库扩展
- 对会话、锁、取消、中断这类状态要优先写回归测试
- 先保证 AI 主线稳定，再往巡检、审计等上层能力扩展

## 测试与校验

当前仓库大量使用 Node 原生 `node:test` 风格的小型回归测试，分布在：

- `server/**/*.test.ts`
- `src/features/workbench/**/*.test.ts`
- `electron/**/*.test.ts`

常用校验：

```bash
pnpm typecheck
pnpm lint
pnpm exec tsx --test server/agent/agentRuntime.test.ts
pnpm exec tsx --test server/agent/sessionRegistry.test.ts
pnpm exec tsx --test src/features/workbench/aiAssistantPanelModel.test.ts
```

## 常见问题

### 桌面端启动后 `Failed to fetch`

先确认：

- Electron backend 进程是否成功启动
- `serverBase` 是否拿到了桌面 runtime 注入的 API / WS 地址
- `file://` 场景下接口是否走桌面端地址而不是相对路径

### Agent 执行后会话一直 busy

先看最近的 `sessionRegistry` 修复是否已包含在当前构建产物中；旧包会出现命令中断后锁未释放的问题。

### 白色主题下 AI 面板文字不可见

优先检查是否又引入了 `text-neutral-100` / `text-violet-50` 这类深色主题硬编码，而没有走 `--app-text-*` 语义变量。

### 构建产物占用磁盘

本地打包会生成较大的 `release/`、Electron 缓存和 pnpm store。构建前建议先清理旧的 `win-unpacked/`，不要把二进制产物提交进仓库。

## 后续建议

- 继续收敛主题系统，消除剩余硬编码颜色
- 为 Agent 增加更清晰的“等待人工输入 / 人工接管中”前端状态提示
- 逐步补齐更系统的桌面端回归测试
- 在打包脚本里加入预清理，避免本地产物持续堆积
