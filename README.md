# OpsClaw

OpsClaw 是面向桌面与本地运行时的 AI-native SSH 运维工作台。它把节点、终端、AI Chat / Agent、结构化 HITL、快捷脚本、节点状态巡检与 Electron 桌面运行时收敛到同一个工作区里，让后续运维自动化能力可以在一个统一的「AI + SSH」底座上持续迭代。

## OpsClaw 是什么

这个仓库提供了既有 Web 开发体验又有 Electron 桌面壳的工程基础。React/Vite 负责工作台、设置、AI 面板与终端，Express/WebSocket + ssh2 搭建后端的 Node 网关与 Agent runtime，Electron 负责将这个系统打包成桌面应用并处理运行时桥接。开发者来到这里，是为了了解系统的当前能力、快速跑起来并找到下一步要修改的代码入口。

## 快速开始

当前发布版本：`0.2.0`。

```bash
pnpm install
pnpm dev
pnpm desktop:dev
pnpm desktop:pack:win
```

`pnpm dev` 同时启动 Vite 前端（默认 `http://localhost:5173`）和 Express/SSH 网关（默认 `http://localhost:4000`）。`pnpm desktop:dev` 会先编译 Electron 主进程，然后启动渲染器与桌面壳，方便调试。`pnpm desktop:pack:win` 会在 `release/` 下产出比如 `OpsClaw-0.2.0-win.zip` 的安装包，主运行路径在 `release/win-unpacked/`（桌面运行时的 unpack 目录）。

## 当前能力概览

### 节点与终端
- 节点与分组数据由后端管理，前端 Session 树展示树状关系、搜索、上下文菜单和拓扑信息。
- 每次打开终端都会复用 `SshTerminalPane` + `useSshTerminal*` hooks，保持命令历史、运行时状态、搜索建议和切换会话的流畅度。
- 命令在后台写入 `commandHistoryStore`，并在工作台里提供可搜索的执行记录与回放线索。

### AI Chat / Agent
- `AiAssistantPanel` 同时承载 Chat 与 Agent，两者共用流式 LLM 输出、上下文提醒与标记的参数输入。
- Agent 依赖 ReAct 风格执行器，对多步命令保持锁、支持中断与人工回退，并且可以在面板内显示当前步骤、工具调用与上下文。

### 结构化 HITL
- Agent 交互呈现为结构化卡片，需要人工确认参数、审批执行进度或继续输入，避免阻塞式终端输入。
- HITL 卡片直接在 `AiAssistantPanel` 中出现，开发者可以审查 LLM 生成的建议、填充字段，然后再回传执行或取消。

### 快捷脚本与终端增强
- 快捷脚本从旧的脚本库面板已经迁移到设置中心的「脚本」标签页统一管理，不再分散在工作台右侧区域。
- `terminalQuickScriptModel` 提供 `x alias`、`x dashboard` 等命令行快捷方式，快速从终端呼出脚本、面板或 Dashboards。
- 终端增强包括命令主题高亮、搜索建议、自动完成历史与脚本变量替换。

### 节点状态 Dashboard
- `NodeStatusDashboardDialog` 汇总最近的巡检快照、操作结果和健康状态，方便在工作台横幅内调度。
- `nodeInspectionService` 定期采集节点指标和脚本执行结果，为 Dashboard 提供历史记录与可视化。

### 设置与桌面运行时
- 设置页负责 LLM provider 配置（内置候选、OpenAI-compatible、自定义 `baseUrl`）以及节点记忆和脚本自动上下文管理，所有快捷脚本都在该中心维护。
- Electron 桌面端负责启动独立的后端进程、注入 `OPSCLAW_ELECTRON_*` 运行时配置，并将日志写入用户数据目录。
- Windows 打包依赖 `electron-builder`，输出目录是 `release/`，桌面端也可将数据写入 `data/`（见下文）。

## 架构概览

- `src/`：以 React + Vite 搭建的工作台 shell、路由、组件与特性目录，包含工作台、设置、终端、AI 面板。
- `server/`：Express、WebSocket、ssh2、sql.js 搭建的后端，包括 HTTP API、Terminal gateway、Agent runtime、节点巡检与数据库。
- `server/agent/`：Agent runtime、工具注册、会话锁与记忆写入逻辑，为 `AiAssistantPanel` 提供多轮执行能力。
- `electron/`：Electron 主进程、预加载脚本、窗口生命周期、桌面运行时配置与日志。
- `docs/`：运维定位、设计 spec、实现计划与超级能力演进记录。

## 核心模块地图

- `src/routes/WorkbenchPage.tsx`：工作台页面布局、左右区域分布、路由入口。
- `src/features/workbench/AiAssistantPanel.tsx`：AI Chat/Agent 面板、结构化 HITL 卡片、审批与输入控件。
- `src/features/workbench/terminalQuickScriptModel.ts`：快捷脚本、`x alias`、`x dashboard` 以及终端动作建模。
- `src/features/workbench/NodeStatusDashboardDialog.tsx`：节点状态仪表盘、巡检结果可视化与快照回放。
- `server/nodeInspectionService.ts`：周期巡检、节点指标收集与 Dashboard 数据源。
- `server/agent/`：Agent 运行时、工具注册、锁管理与 API。
- `electron/`：桌面主进程、preload、安全桥接、打包与开发脚本。

## 开发与调试

- 常用命令：`pnpm dev`（Web 开发）、`pnpm desktop:dev`（桌面快速迭代）、`pnpm desktop:pack:win`（Windows 打包）、`pnpm lint`、`pnpm typecheck`。
- 本地运行时会在 `data/` 下生成 `opsclaw.sqlite`、`opsclaw.master.key` 与 `memory/` 目录，阅读、备份和清空都在这个路径下完成。
- 可以用 `OPSCLAW_DATA_DIR=/path` 改写数据目录以支持多环境或 CI。
- 桌面端调试时，Electron 会把 backend 进程和前端分开启动；主进程与 backend 日志默认写入 Electron `userData/logs/`，运行时数据则落到对应的 `OPSCLAW_DATA_DIR`。
- 项目仍处于快速迭代阶段，主链路（SSH + AI + Desktop）稳定后再继续向巡检、审计等上层能力推进。

## 文档索引

- `docs/opsclaw.md`
- `docs/opsclaw-mvp-slim.md`
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`
