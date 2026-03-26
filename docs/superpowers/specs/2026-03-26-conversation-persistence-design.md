# 会话线程持久化与恢复设计

## 背景

当前 OpsClaw 的 AI 面板存在两个明显问题：

1. `chat` 和 `agent` 的消息状态主要保留在前端内存中，关闭面板、刷新页面或重新进入工作台后无法恢复。
2. 用户在 AI 执行失败后，常常会直接在终端里手工排查或修复；但这些人工操作不会进入 AI 可恢复的上下文，导致用户再次回到 AI 时只能从头开始。

项目当前已经具备以下基础：

- SSH 会话有稳定的 `sessionId`，并且 `sessionId` 与节点绑定。
- Agent 端已经具备服务端 ReAct 循环、工具调用、Markdown 渲染与文件型记忆能力。
- 命令历史 `command_history` 已经入库，但其目标是命令推荐与搜索，不是按时间顺序恢复会话上下文。

因此，这一阶段需要补齐“长期会话线程”的持久化能力，让 AI 助手真正成为和当前 SSH 会话绑定的持续助手，而不是每次打开都重新开始的临时聊天框。

## 目标

本设计只解决“会话线程持久化与恢复”这一件事。

目标如下：

- 同一个 SSH `sessionId` 下，AI 会话线程默认长期保存。
- 用户关闭 AI 面板、刷新页面或稍后回到同一会话时，能够恢复此前的对话与执行轨迹。
- 用户在终端中手动执行过的关键命令，能够以可控摘要形式进入会话线程，供后续 AI 恢复上下文。
- Agent 在新任务开始时，能自动读取最近的线程上下文，而不是每次都从零开始。
- 用户可以手动清空当前线程，或删除历史线程。

非目标如下：

- 不做终端全量 transcript 长期入库。
- 不做全文搜索、审计检索或多线程分支管理。
- 不做复杂的自动线程命名或长期压缩归档。
- 不改变现有 `MEMORY.md` 文件记忆机制，线程持久化是补充层，不替代长期记忆文档。

## 设计原则

### 1. 以 `sessionId` 为中心，而不是以单次请求为中心

OpsClaw 的真实工作对象是 SSH 会话，不是某一条 prompt。用户对同一台机器的排查往往跨越多个问题、多轮交互和多次人工终端操作。持久化单元必须是“和当前 SSH 会话绑定的长期线程”。

### 2. 会话线程保存“可恢复上下文”，不保存全部噪音

要保存的是：

- 用户说了什么
- AI 回了什么
- 调用了哪些工具
- 工具得到了什么关键结果
- 用户手动执行了哪些关键命令
- 会话停在什么状态

不应该保存的是：

- 全量终端 transcript
- 无边界增长的大块工具输出
- 与后续恢复无关的瞬时中间态

### 3. 文件记忆和线程历史分层存在

文件记忆负责长期稳定知识：

- 全局 `MEMORY.md`
- 节点 `MEMORY.md`
- 分组 `MEMORY.md`

线程历史负责短中期任务上下文：

- 这次到底查了什么
- 哪个命令跑过
- 人工刚刚改过什么
- 上一次为什么停住

两者必须同时存在，不能互相替代。

## 方案对比

### 方案 A：只做浏览器本地持久化

做法：

- 在浏览器 `localStorage` 或 IndexedDB 里按 `sessionId` 保存 chat/agent 消息。

优点：

- 实现最简单，见效快。

缺点：

- 只在当前浏览器有效。
- 刷新、清缓存、换机器后丢失。
- 服务端 Agent 无法直接利用这些历史。
- 无法支撑后续审计或线程管理。

结论：

- 不采用。

### 方案 B：服务端线程入库 + 前端恢复展示

做法：

- 服务端为每个 `sessionId` 保存长期线程及事件流。
- 前端面板打开时恢复当前线程。
- Agent 新任务开始时自动读取最近线程事件。

优点：

- 刷新后可恢复。
- 服务端可直接构建上下文。
- 适合后续扩展线程列表、清理、搜索。

缺点：

- 需要新增表结构、Store、API 和 UI 适配。

结论：

- 本阶段采用。

### 方案 C：全量事件溯源，包括 transcript 全量入库

做法：

- 所有用户消息、AI 消息、tool 调用、tool 结果、终端 transcript 全量持久化。

优点：

- 审计和回放能力最强。

缺点：

- 数据量大，噪音重，第一阶段复杂度过高。

结论：

- 暂不采用，作为后续可能扩展方向。

## 最终方案

采用方案 B：建立“会话线程 + 事件流”的服务端持久化层，并保留前端恢复能力。

### 核心行为

- 每个 SSH `sessionId` 对应一条当前活跃 AI 线程。
- 用户在 AI 面板内的 `chat` 和 `agent` 交互都写入同一线程。
- Agent 执行过程中的关键事件写入同一线程。
- 用户在终端手动执行命令时，将命令及摘要结果写入同一线程。
- AI 面板重新打开时，前端根据当前 `sessionId` 自动恢复活跃线程。
- Agent 新任务开始时，服务端读取最近线程事件并注入 prompt。
- 用户可以清空当前线程或删除线程。

## 数据模型

### 表一：`conversation_threads`

用途：表示与某个 `sessionId` 绑定的一条长期线程。

字段：

- `id TEXT PRIMARY KEY`
- `session_id TEXT NOT NULL`
- `node_id TEXT`
- `title TEXT NOT NULL`
- `status TEXT NOT NULL`
  - 允许值：`active | completed | failed | cancelled | cleared`
- `last_run_id TEXT`
- `summary TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `last_activity_at TEXT NOT NULL`
- `cleared_at TEXT`

索引：

- `idx_conversation_threads_session_id(session_id)`
- `idx_conversation_threads_last_activity(last_activity_at DESC)`

约束和规则：

- 同一个 `sessionId` 在任意时刻只允许一条 `status != cleared` 的活跃线程。
- 当用户执行“清空当前线程”时，当前线程标记为 `cleared`，再为后续会话创建新的活跃线程。
- 当仅需恢复当前上下文时，优先取该 `sessionId` 最近活跃线程。

### 表二：`conversation_events`

用途：按时间顺序保存线程中的关键事件。

字段：

- `id TEXT PRIMARY KEY`
- `thread_id TEXT NOT NULL REFERENCES conversation_threads(id)`
- `session_id TEXT NOT NULL`
- `run_id TEXT`
- `channel TEXT NOT NULL`
  - 允许值：`chat | agent | terminal | system`
- `event_type TEXT NOT NULL`
  - 允许值：
    - `user_message`
    - `assistant_message`
    - `tool_call`
    - `tool_result`
    - `final_answer`
    - `status`
    - `manual_command`
- `step INTEGER`
- `sequence INTEGER NOT NULL`
- `content_text TEXT`
- `content_json TEXT`
- `created_at TEXT NOT NULL`

索引：

- `idx_conversation_events_thread_id(thread_id, sequence)`
- `idx_conversation_events_session_id(session_id, created_at DESC)`
- `idx_conversation_events_run_id(run_id)`

字段使用规则：

- `content_text` 保存用户可读主文本，例如 Markdown 回复、状态文案、命令摘要。
- `content_json` 保存结构化负载，例如 tool 参数、tool 返回摘要、命令元数据。
- `sequence` 由线程内单调递增，作为稳定排序依据。

## 事件写入规则

### Chat 模式

用户发送消息时：

- 写入 `channel=chat`
- `event_type=user_message`

AI 完成回复时：

- 写入 `channel=chat`
- `event_type=assistant_message`

如果中途失败：

- 写入 `channel=system`
- `event_type=status`
- 内容为失败原因

### Agent 模式

用户发起任务时：

- 写入 `channel=agent`
- `event_type=user_message`

Agent 执行过程中：

- 每条 `assistant_message` 写 `event_type=assistant_message`
- 每条 `tool_call` 写 `event_type=tool_call`
- 每条 `tool_execution_finished` 写 `event_type=tool_result`
- `run_failed` / `run_cancelled` 写 `event_type=status`
- `run_completed` 额外写 `event_type=final_answer`

其中：

- `tool_call` 的参数写入 `content_json`
- `tool_result` 不保存无边界原始输出，只保存格式化摘要；原始大输出若存在，先截断

### 终端人工命令

用户在终端中手动执行命令并完成后：

- 写入 `channel=terminal`
- `event_type=manual_command`

保存内容：

- 命令文本
- 退出码
- 耗时
- 截断后的输出摘要
- 时间戳

不保存全量 transcript，也不为每个字节流片段建事件。

## 上下文恢复策略

### 前端恢复

AI 面板打开时：

1. 根据当前 `sessionId` 请求活跃线程。
2. 如果存在活跃线程，则恢复该线程事件流。
3. 如果不存在，则展示空态，并在首次发送消息时创建线程。

恢复展示规则：

- `chat` 和 `agent` 共用同一线程数据源。
- UI 可按 `channel` 和 `event_type` 过滤显示。
- 终端人工命令事件展示为“用户在终端中执行过的补充操作”。

### Agent 恢复

新任务开始时，服务端构建 prompt 时加载以下上下文：

- 全局 `MEMORY.md`
- 当前线程最近关键事件
- 最近人工命令事件
- 节点/分组记忆，按需工具读取

建议裁剪策略：

- 最多注入最近 30 到 50 条事件
- 优先保留：
  - 最近用户消息
  - 最近最终结论
  - 最近工具结果摘要
  - 最近人工命令
- 对超长 `content_text` 做截断
- 对连续状态事件进行压缩

这样可以避免 token 无边界增长，同时保留足够的恢复能力。

## 后端组件拆分

### `conversationStore`

新增 Store，职责如下：

- 创建线程
- 获取 `sessionId` 的活跃线程
- 列出线程
- 写入事件
- 获取线程事件
- 清空线程
- 删除线程
- 更新线程状态和最近活动时间

建议接口：

- `getActiveThreadBySessionId(sessionId)`
- `createThread(input)`
- `getOrCreateActiveThread(input)`
- `appendEvent(input)`
- `listEvents(threadId, options)`
- `clearThread(threadId)`
- `deleteThread(threadId)`
- `markThreadStatus(threadId, status)`

### Agent Runtime 集成

`OpsAgentRuntime` 扩展依赖：

- 传入 `conversationStore`
- `run()` 开始时获取/创建当前线程
- 执行中同步写入事件
- 完成或失败时更新线程状态
- 构建初始上下文时读取最近线程事件摘要

### Chat 接口集成

当前 `/api/llm/chat` 仅负责流式输出，需要扩展为：

- 请求中允许传入 `sessionId`
- 服务端在开始时获取/创建线程
- 用户消息入库
- AI 完整输出结束后入库
- 错误状态入库

### 终端集成

当前终端侧已有命令执行识别能力，需要补一个“人工命令事件写入”入口：

- 仅在用户主动执行命令且拿到完成结果时写入
- 不记录 shell 初始化噪音
- 可复用已有命令结束标记解析能力

## API 设计

第一阶段补充以下接口：

### 获取当前会话活跃线程

- `GET /api/conversations/session/:sessionId`

返回：

- 当前活跃线程元数据
- 最近事件列表

### 清空当前会话线程

- `POST /api/conversations/session/:sessionId/clear`

行为：

- 将当前线程标记为 `cleared`
- 后续新消息会创建新线程

### 删除线程

- `DELETE /api/conversations/threads/:threadId`

行为：

- 硬删除线程及其事件

### 获取线程事件

- `GET /api/conversations/threads/:threadId/events`

行为：

- 分页或按最近条数返回事件

第二阶段可扩展：

- `GET /api/conversations`
- `GET /api/conversations/search`

## 前端改造

### 状态模型

当前：

- `useStreamingChat()` 持有独立前端消息数组
- `useAgentRun()` 持有独立 timeline 数组

改造后：

- 引入统一线程数据源
- `chat` 和 `agent` 面板基于同一线程恢复
- 本地状态只负责“当前流式中的临时增量”，最终仍以服务端线程为准

### UI 行为

AI 面板打开时：

- 自动恢复当前 `sessionId` 的活跃线程
- 不再默认新建空白历史

提供操作：

- `清空当前线程`
- `删除当前线程`

可选增强：

- 面板头部显示“已恢复会话”
- 显示最近活动时间

### 展示策略

- `chat` 模式默认突出用户与 AI 文本消息
- `agent` 模式默认突出工具调用、工具结果与最终结论
- `terminal` 人工命令以辅助卡片显示，不与 AI 回复混淆

## 错误处理

- 如果线程恢复失败，不阻止用户继续发起新消息；前端展示警告并退回空态
- 如果事件写入失败，不中断当前 AI 响应，但记录服务端日志
- 如果线程已被清空或删除，下一次交互自动创建新线程
- 如果 `sessionId` 无对应有效会话，接口返回明确错误

## 测试策略

### 后端

- `conversationStore` 单测
  - 创建线程
  - 获取活跃线程
  - 写入事件
  - 清空线程
  - 删除线程
- Agent runtime 集成测试
  - 新任务写入完整事件链
  - 恢复时能拿到最近线程事件
- Chat 接口测试
  - 用户消息与 AI 回复成功入库
- 终端人工命令测试
  - 命令完成后写入 `manual_command`

### 前端

- 打开面板自动恢复线程
- 清空线程后 UI 正确重置
- 删除线程后重新发消息会创建新线程
- 同一 `sessionId` 关闭后重新打开不丢失历史

## 实施顺序

第一阶段建议按以下顺序落地：

1. 数据库新增 `conversation_threads` 与 `conversation_events`
2. 新建 `conversationStore`
3. 补会话线程 API
4. 接入 Agent 事件写入与恢复
5. 接入 Chat 事件写入与恢复
6. 接入终端人工命令事件写入
7. 前端 AI 面板恢复与清理操作

## 风险与取舍

### 风险 1：事件过多导致 prompt 变重

取舍：

- 第一阶段只注入最近关键事件
- 工具结果与终端输出做摘要和截断

### 风险 2：终端人工命令识别不稳定

取舍：

- 第一阶段只记录已被当前终端执行器明确识别为“完成的一条命令”的结果
- 不追求全量 shell 行为回放

### 风险 3：chat 和 agent 共用线程后，UI 复杂度上升

取舍：

- 底层统一事件流
- 展示层按模式过滤
- 避免后端存两套历史

## 验收标准

完成后应满足以下标准：

- 同一 `sessionId` 下，AI 面板关闭再打开能恢复历史。
- 刷新页面后，AI 面板仍能恢复该会话的活跃线程。
- 用户手动在终端执行命令后，AI 下一次运行能够看到最近人工命令摘要。
- Agent 在新任务开始时，不会完全丢失上一轮任务的短期上下文。
- 用户可以手动清空当前线程。
- 用户可以删除线程。

