# README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `README.md` 重构为面向开发者/贡献者的入口文档，提供准确的快速启动、能力概览、架构概览、模块地图与文档索引。

**Architecture:** 本次迭代只修改文档，不改运行时代码。实施方式是直接重写 `README.md` 的章节结构，使其承担“5 分钟建立认知 + 找到代码入口”的职责，同时把深入内容导向 `docs/` 与 `docs/superpowers/`。

**Tech Stack:** Markdown、Git、pnpm 项目脚本、现有仓库目录结构

---

### Task 1: 校准 README 信息源

**Files:**
- Modify: `/Users/eumenides/Desktop/jaguarliu/core/opsclaw/README.md`
- Reference: `/Users/eumenides/Desktop/jaguarliu/core/opsclaw/package.json`
- Reference: `/Users/eumenides/Desktop/jaguarliu/core/opsclaw/docs/superpowers/specs/2026-04-10-readme-refresh-design.md`

- [ ] **Step 1: 读取当前 README、版本号与设计 spec**

Run:

```bash
sed -n '1,260p' /Users/eumenides/Desktop/jaguarliu/core/opsclaw/README.md
sed -n '1,220p' /Users/eumenides/Desktop/jaguarliu/core/opsclaw/package.json
sed -n '1,260p' /Users/eumenides/Desktop/jaguarliu/core/opsclaw/docs/superpowers/specs/2026-04-10-readme-refresh-design.md
```

Expected:

```text
README 中仍包含旧版章节与过时描述；package.json 版本为 0.2.0；spec 已定义新的 README 结构与取舍原则。
```

- [ ] **Step 2: 记录必须更新的 README 事实项**

在计划执行备注中确认以下事实项必须出现在新 README 中：

```text
- 版本号更新为 0.2.0
- Windows 打包命令为 pnpm desktop:pack:win
- 主运行模式为 Web 开发、桌面开发、Windows 打包
- 脚本能力已收敛到统一设置中心
- AI 交互包含 Chat / Agent 双模式与结构化 HITL
- 节点状态 Dashboard 与巡检快照已存在
```

- [ ] **Step 3: 确认 README 的新章节骨架**

执行时应将 `README.md` 重组为以下一级标题：

```markdown
## OpsClaw 是什么
## 快速开始
## 当前能力概览
## 架构概览
## 核心模块地图
## 开发与调试
## 文档索引
```

- [ ] **Step 4: 提交本任务**

```bash
git add /Users/eumenides/Desktop/jaguarliu/core/opsclaw/docs/superpowers/plans/2026-04-10-readme-refresh.md
git commit -m "docs: add readme refresh implementation plan"
```

Expected:

```text
plan 文件已提交，后续 README 改写有可执行依据。
```

### Task 2: 重写 README 主体内容

**Files:**
- Modify: `/Users/eumenides/Desktop/jaguarliu/core/opsclaw/README.md`
- Reference: `/Users/eumenides/Desktop/jaguarliu/core/opsclaw/package.json`

- [ ] **Step 1: 重写顶部定位与快速开始**

将 README 顶部改写为更聚焦开发者的定位，并保留最关键启动命令。开头内容应接近以下结构：

```markdown
# OpsClaw

OpsClaw 是一个面向桌面与本地运行时的 AI-native SSH 运维工作台。

它把 SSH 节点、终端会话、AI Chat / Agent、快捷脚本、节点状态巡检、结构化 HITL 和桌面端运行时收敛到同一个工作区中，目标是为后续运维自动化能力提供统一底座。

## 快速开始

```bash
pnpm install
pnpm dev
pnpm desktop:dev
pnpm desktop:pack:win
```
```

- [ ] **Step 2: 用按工作流分组的方式重写“当前能力概览”**

将旧的平铺功能列表替换为分组能力说明，至少覆盖以下分组：

```markdown
### 节点与终端
### AI Chat / Agent
### 结构化 HITL
### 快捷脚本与终端增强
### 节点状态 Dashboard
### 设置与桌面运行时
```

每组内容应明确当前真实能力，例如：

```markdown
- `x <alias>` 快捷执行脚本，`x dashboard` 可直接打开节点状态面板
- Agent 的参数确认与审批以结构化卡片交互呈现，而不是阻塞式终端输入
- 节点巡检默认按机器类型生成脚本并保留最近快照
```

- [ ] **Step 3: 重写“架构概览”与“核心模块地图”**

将现有目录说明压缩为顶层架构与模块入口索引，至少包含以下内容：

```markdown
## 架构概览

- `src/`：React 工作台、设置页、终端与 AI 面板
- `server/`：Express API、SSH/WS 网关、Agent runtime、节点巡检与数据存储
- `electron/`：桌面端主进程、窗口生命周期、运行时桥接
- `docs/`：设计文档、实现计划与专题记录

## 核心模块地图

- `src/routes/WorkbenchPage.tsx`
- `src/features/workbench/AiAssistantPanel.tsx`
- `src/features/workbench/terminalQuickScriptModel.ts`
- `src/features/workbench/NodeStatusDashboardDialog.tsx`
- `server/nodeInspectionService.ts`
- `server/agent/`
- `electron/`
```

- [ ] **Step 4: 重写“开发与调试”与“文档索引”**

在 README 末尾收敛高频调试信息，并把深入阅读导向 `docs/`：

```markdown
## 开发与调试

- 常用命令：`pnpm lint`、`pnpm typecheck`
- 数据目录：`data/`，可通过 `OPSCLAW_DATA_DIR` 覆盖
- 当前项目处于快速迭代阶段，优先保证主链路与桌面端体验稳定

## 文档索引

- `docs/opsclaw.md`
- `docs/opsclaw-mvp-slim.md`
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`
```

- [ ] **Step 5: 提交 README 改写**

```bash
git add /Users/eumenides/Desktop/jaguarliu/core/opsclaw/README.md
git commit -m "docs: refresh readme for contributors"
```

Expected:

```text
README 结构与内容已切换到开发者入口文档形态。
```

### Task 3: 校验 README 的准确性与可读性

**Files:**
- Modify: `/Users/eumenides/Desktop/jaguarliu/core/opsclaw/README.md`

- [ ] **Step 1: 检查 README 是否仍包含过时表述**

Run:

```bash
rg -n "0\\.1\\.0|ScriptLibraryPanel|后续建议|常见问题" /Users/eumenides/Desktop/jaguarliu/core/opsclaw/README.md
```

Expected:

```text
无匹配，或仅保留仍然合理的章节名；不再出现旧版本号与旧模块名称。
```

- [ ] **Step 2: 检查 README 的章节骨架是否符合设计**

Run:

```bash
rg -n "^## " /Users/eumenides/Desktop/jaguarliu/core/opsclaw/README.md
```

Expected:

```text
输出包含：OpsClaw 是什么、快速开始、当前能力概览、架构概览、核心模块地图、开发与调试、文档索引。
```

- [ ] **Step 3: 人工审读 README 的篇幅与可扫描性**

Run:

```bash
sed -n '1,260p' /Users/eumenides/Desktop/jaguarliu/core/opsclaw/README.md
```

Expected:

```text
README 能在一次滚动阅读中完成高层理解，不会重新退化为长篇细节堆砌文档。
```

- [ ] **Step 4: 提交最终文档校验结果**

```bash
git add /Users/eumenides/Desktop/jaguarliu/core/opsclaw/README.md
git commit -m "docs: polish readme structure and links"
```

Expected:

```text
README 最终内容通过自检，可以交给用户评估。
```
