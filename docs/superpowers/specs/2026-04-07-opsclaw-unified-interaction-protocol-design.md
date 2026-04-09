# OpsClaw 统一交互协议设计

> 日期：2026-04-07
> 状态：已确认设计，待进入 implementation planning

## 1. 背景

当前 OpsClaw 的人机交互主要由几类专用 gate 驱动：

- `approval`
- `parameter_confirmation`
- `terminal_input`

这套模型已经能覆盖第一批 HITL 需求，但它有三个明显问题：

1. 交互类型是写死的，扩展新场景时容易继续堆新的 gate 分支。
2. 前端是按具体 gate 类型写产品体验，而不是按统一协议消费交互语义。
3. “向用户咨询信息”“让用户确认参数”“让用户批准高风险动作”“等待用户完成终端输入”本质上都是同一类事情：运行时暂停在一个结构化的用户交互点，等待用户提交结果后再决定是否继续执行。

OpsClaw 当前尚未对外提供稳定 API，仍处于第一版产品迭代阶段，因此本次设计选择直接切换到新的统一协议，而不是为旧模型保留兼容层。

## 2. 目标

本设计的目标是引入一套由 runtime 拥有的统一交互协议 `interaction_request`，覆盖所有 AI 与用户之间的结构化交互场景。

本次设计要达成：

- 用统一协议替代现有 `approval / parameter_confirmation / terminal_input`
- runtime 成为唯一的交互请求生产者
- 前端只消费结构化 schema，不自行定义安全语义
- 保留安全边界：是否阻断、是否允许继续执行、是否属于高危交互，全部由 runtime 决定
- 支持 AI panel 与全局 pending queue 共享同一套 interaction 数据
- 为后续高危命令确认、密码输入、参数收集、单选/多选问询等场景建立通用底层协议

## 3. 非目标

本次设计不包含以下内容：

- 自定义组件注册机制
- 批量审批
- 单个 run 内同时存在多个活跃交互请求
- 复杂字段联动和动态 schema 扩展
- 对旧 gate API 做兼容保留

## 4. 核心设计原则

### 4.1 Runtime 拥有控制面

agent 可以表达执行意图和交互需求信号，但不能直接决定最终弹什么 UI，也不能直接拥有“放行高风险执行”的权限。

runtime 必须是：

- 唯一的 `interaction_request` 生产者
- 唯一的交互阻断控制者
- 唯一的交互提交校验与执行恢复入口

### 4.2 前端只消费协议

前端的职责仅限于：

- 渲染 `interaction_request`
- 收集用户输入
- 提交 `InteractionSubmission`
- 根据 SSE 与 snapshot 维护视图状态

前端不能：

- 自行推导风险等级
- 自行决定某个交互是否允许继续执行
- 自行改变阻断语义

### 4.3 固定原语集合，版本化演进

第一版协议只允许固定字段原语，不支持自定义组件类型。协议通过 `schemaVersion` 演进，而不是在同一版本中偷偷修改字段语义。

### 4.4 单个 run 同时最多一个活跃交互请求

并发规则固定为：

- 多个 run 可以同时各有一个 pending interaction
- 单个 run 同时最多只有一个 active interaction
- 链式交互允许，但必须串行

## 5. 总体架构

统一交互协议引入后，系统分为三层：

### 5.1 Agent 层

agent 只负责：

- 输出任务执行意图
- 触发命令执行、参数需求、高危操作等语义信号

agent 不直接定义前端 schema，不直接调“UI 工具”向前端下发任意组件树。

### 5.2 Runtime 层

runtime 统一负责编译与控制：

- 判断当前执行流是否需要用户交互
- 生成 `interaction_request`
- 决定 `interactionKind / riskLevel / blockingMode`
- 保存 active interaction
- 在用户提交前阻断或挂起 run
- 校验用户提交
- 恢复、拒绝、失败、继续等待

### 5.3 Frontend 层

frontend 统一消费：

- `interaction_request`
- `run_state_changed`
- `AgentRunSnapshot`

frontend 渲染 AI panel、global pending queue、detail panel，但不拥有安全控制权。

## 6. 数据模型

### 6.1 InteractionRequest

```ts
type InteractionRequest = {
  id: string;
  runId: string;
  sessionId: string;
  status: 'open' | 'submitted' | 'resolved' | 'rejected' | 'expired';

  interactionKind:
    | 'collect_input'
    | 'approval'
    | 'danger_confirm'
    | 'terminal_wait'
    | 'inform';

  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  blockingMode: 'none' | 'soft_block' | 'hard_block';

  title: string;
  message: string;
  schemaVersion: 'v1';

  fields: InteractionField[];
  actions: InteractionAction[];

  openedAt: number;
  deadlineAt: number | null;

  metadata: Record<string, unknown>;
};
```

字段语义：

- `interactionKind`：产品语义类型
- `riskLevel`：风险强调等级
- `blockingMode`：当前交互对 run 的阻断强度
- `fields`：固定原语字段集合
- `actions`：用户可执行动作
- `metadata`：上下文附加信息，例如 `sessionLabel`、`commandPreview`、`intentKind`

### 6.2 InteractionField

```ts
type InteractionField =
  | {
      type: 'display';
      key: string;
      label?: string;
      value: string;
    }
  | {
      type: 'text';
      key: string;
      label: string;
      required?: boolean;
      value?: string;
      placeholder?: string;
    }
  | {
      type: 'password';
      key: string;
      label: string;
      required?: boolean;
      value?: string;
      placeholder?: string;
    }
  | {
      type: 'textarea';
      key: string;
      label: string;
      required?: boolean;
      value?: string;
      placeholder?: string;
    }
  | {
      type: 'single_select';
      key: string;
      label: string;
      required?: boolean;
      options: Array<{ label: string; value: string; description?: string }>;
      value?: string;
    }
  | {
      type: 'multi_select';
      key: string;
      label: string;
      required?: boolean;
      options: Array<{ label: string; value: string; description?: string }>;
      value?: string[];
    }
  | {
      type: 'confirm';
      key: string;
      label: string;
      required?: boolean;
      value?: boolean;
    };
```

第一版固定只支持这些原语，不支持自定义组件。

### 6.3 InteractionAction

```ts
type InteractionAction = {
  id: string;
  label: string;
  kind:
    | 'submit'
    | 'approve'
    | 'reject'
    | 'cancel'
    | 'continue_waiting'
    | 'acknowledge';
  style: 'primary' | 'secondary' | 'danger';
};
```

### 6.4 InteractionSubmission

```ts
type InteractionSubmission = {
  runId: string;
  requestId: string;
  selectedAction: string;
  payload: Record<string, unknown>;
};
```

该结构统一覆盖：

- 参数补全提交
- 普通审批
- 高危确认
- 继续等待终端输入

## 7. 运行时状态机

### 7.1 Run 执行态

```ts
type AgentRunExecutionState =
  | 'running'
  | 'blocked_by_interaction'
  | 'blocked_by_terminal'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

```ts
type AgentRunBlockingMode =
  | 'none'
  | 'interaction'
  | 'terminal_wait';
```

映射规则：

- 普通执行：`running + none`
- `collect_input / approval / danger_confirm`：`blocked_by_interaction + interaction`
- `terminal_wait`：`blocked_by_terminal + terminal_wait`
- 交互超时或中断后挂起：`suspended + none`

### 7.2 InteractionKind 与阻断语义映射

建议固定映射：

- `collect_input`
  - `riskLevel = low | medium`
  - `blockingMode = soft_block`
- `approval`
  - `riskLevel = high`
  - `blockingMode = soft_block`
- `danger_confirm`
  - `riskLevel = critical`
  - `blockingMode = hard_block`
- `terminal_wait`
  - `riskLevel = medium | high`
  - `blockingMode = hard_block`
- `inform`
  - `riskLevel = none`
  - `blockingMode = none`

### 7.3 单 run 约束

- 单个 run 同时只能存在一个 `status=open` 的 active interaction
- 一个 interaction 结束后，run 才能进入下一个 interaction 或继续执行

## 8. Runtime 编译流程

### 8.1 编译入口

所有交互生成统一收敛到 runtime 工厂，例如：

```ts
createInteractionRequest(input: {
  runId: string;
  sessionId: string;
  source:
    | 'policy_approval'
    | 'parameter_collection'
    | 'danger_confirmation'
    | 'terminal_wait'
    | 'informational_notice';
  context: Record<string, unknown>;
}): InteractionRequest
```

### 8.2 来源类型

runtime 第一版建议支持以下来源：

- `policy_approval`
- `parameter_collection`
- `danger_confirmation`
- `terminal_wait`
- `informational_notice`

### 8.3 来源到协议的映射

#### 参数补全

输入来源：

- `source = parameter_collection`

输出：

- `interactionKind = collect_input`
- `blockingMode = soft_block`
- `actions = submit + reject`

#### 普通审批

输入来源：

- `source = policy_approval`

输出：

- `interactionKind = approval`
- `blockingMode = soft_block`
- `actions = approve + reject`

#### 高危确认

输入来源：

- `source = danger_confirmation`

输出：

- `interactionKind = danger_confirm`
- `blockingMode = hard_block`
- `fields` 中应至少包含一个 `confirm`

#### 终端等待

输入来源：

- `source = terminal_wait`

输出：

- `interactionKind = terminal_wait`
- `blockingMode = hard_block`
- `fields` 主要由 `display` 构成
- `actions = continue_waiting`

## 9. 提交协议与执行恢复

### 9.1 统一提交入口

运行时统一处理：

```ts
submitInteraction({
  runId,
  requestId,
  selectedAction,
  payload,
})
```

旧的以下接口直接退场：

- `resolveGate`
- `rejectGate`
- `resumeWaiting`

### 9.2 校验顺序

runtime 收到提交后，按固定顺序校验：

1. `runId` 是否存在
2. `requestId` 是否是该 run 当前 active interaction
3. request 是否仍处于 `open`
4. `selectedAction` 是否属于当前 request 的 `actions`
5. `payload` 是否满足 schema 基础校验
6. request 是否已过期或已被替换
7. 当前 run 是否仍允许恢复

### 9.3 提交后的状态

建议交互状态流转为：

- `open -> submitted`
- 再进入：
  - `resolved`
  - `rejected`
  - `expired`

run 状态由 runtime 决定：

- 继续执行
- 进入下一个 interaction
- 挂起
- 失败

### 9.4 恢复规则

不同 `interactionKind` 恢复逻辑不同：

- `collect_input`
  - `submit` 成功后，把字段注入 continuation context，再继续执行
- `approval`
  - `approve` 恢复执行
  - `reject` 进入拒绝分支
- `danger_confirm`
  - 只有满足强确认条件才允许恢复
- `terminal_wait`
  - `continue_waiting` 恢复到底层等待逻辑

### 9.5 幂等与并发

- 同一个 `requestId` 只允许成功提交一次
- 重复提交返回当前最新状态，不重复恢复
- 旧 request 的提交必须失效
- 如果 run 已进入下一个 interaction，旧 submission 必须拒绝

## 10. SSE 事件协议

### 10.1 事件集

建议统一事件：

```ts
type AgentStreamEvent =
  | { type: 'run_started'; ... }
  | { type: 'run_state_changed'; ... }
  | { type: 'assistant_message_delta'; ... }
  | { type: 'assistant_message'; ... }
  | { type: 'tool_call'; ... }
  | { type: 'tool_execution_started'; ... }
  | { type: 'tool_execution_finished'; ... }
  | { type: 'interaction_requested'; runId: string; request: InteractionRequest; timestamp: number }
  | { type: 'interaction_updated'; runId: string; request: InteractionRequest; timestamp: number }
  | { type: 'interaction_resolved'; runId: string; request: InteractionRequest; timestamp: number }
  | { type: 'interaction_rejected'; runId: string; request: InteractionRequest; timestamp: number }
  | { type: 'interaction_expired'; runId: string; request: InteractionRequest; timestamp: number }
  | { type: 'warning'; ... }
  | { type: 'run_completed'; ... }
  | { type: 'run_failed'; ... }
  | { type: 'run_cancelled'; ... };
```

### 10.2 旧事件退场

以下旧事件建议直接删除：

- `human_gate_opened`
- `human_gate_resolved`
- `human_gate_rejected`
- `human_gate_expired`
- `approval_required`

### 10.3 RunStateChanged 职责

`run_state_changed` 只负责执行态投影：

```ts
type RunStateChangedEvent = {
  type: 'run_state_changed';
  runId: string;
  state: AgentRunState;
  executionState: AgentRunExecutionState;
  blockingMode: AgentRunBlockingMode;
  timestamp: number;
};
```

交互内容全部从 `interaction_*` 事件读取。

## 11. Snapshot 与前端状态

### 11.1 AgentRunSnapshot

```ts
type AgentRunSnapshot = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  executionState: AgentRunExecutionState;
  blockingMode: AgentRunBlockingMode;
  activeInteraction: InteractionRequest | null;
};
```

### 11.2 前端事件状态

```ts
type AgentEventState = {
  runId: string | null;
  runState: AgentRunState | null;
  executionState: AgentRunExecutionState | null;
  blockingMode: AgentRunBlockingMode | null;
  activeInteraction: InteractionRequest | null;
  pendingInteractions: PendingInteractionItem[];
  error: string | null;
};
```

### 11.3 PendingInteractionItem

```ts
type PendingInteractionItem = {
  requestId: string;
  runId: string;
  sessionId: string;
  interactionKind: 'collect_input' | 'approval' | 'danger_confirm' | 'terminal_wait';
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  openedAt: number;
};
```

进入 queue 的规则：

- `status === open`
- `blockingMode !== none`
- `interactionKind !== inform`

## 12. 前端渲染规范

### 12.1 统一骨架

每个 interaction card / detail pane 都使用统一骨架：

- 标题
- 描述
- 风险强调
- 会话上下文
- 字段区
- 动作区

### 12.2 固定原语映射

- `display`：只读说明
- `text`：单行输入
- `password`：密码输入
- `textarea`：多行输入
- `single_select`：单选
- `multi_select`：多选
- `confirm`：确认框

### 12.3 表单状态

前端统一维护：

```ts
type InteractionFormState = {
  values: Record<string, unknown>;
  touched: Record<string, boolean>;
  errors: Record<string, string | null>;
};
```

前端只负责基础校验：

- `required`
- 空值检查
- 单选/多选是否为空
- `confirm` 是否勾选

业务语义校验全部交给 runtime。

### 12.4 动作规则

前端只按 `actions[]` 渲染按钮，不自行发明动作按钮。

### 12.5 Terminal Wait 渲染

`terminal_wait` 不应被渲染成普通表单。

建议只展示：

- 当前状态说明
- 会话信息
- 命令摘要
- `continue_waiting` 动作

## 13. AI Panel 与 Global Pending Queue

### 13.1 AI Panel

AI panel 是 run 上下文化视图：

- 展示当前 run timeline
- `interaction_requested` 在 timeline 中呈现为 interaction card
- 支持通过 `requestedRunId` 聚焦到对应 interaction
- 聚焦时应同步：
  - 切到 `agent` 模式
  - 滚动到对应 interaction card
  - 同步到对应 `sessionId`

### 13.2 Global Pending Queue

Global pending queue 是跨 run 聚合视图：

- 展示所有 open 的 pending interaction
- 支持从 pending panel 打开 AI panel 并定位到对应 run/request

两者共享同一份 interaction 数据，不允许成为两套状态源。

## 14. API 形态

建议前端最终只保留以下接口：

1. 启动 run

```ts
POST /api/agent/runs
```

2. 继续 SSE 流

```ts
POST /api/agent/runs/:runId/stream
```

3. 查询可恢复 run

```ts
GET /api/agent/sessions/:sessionId/runs/reattach
```

4. 提交 interaction

```ts
POST /api/agent/runs/:runId/interactions/:requestId/submit
```

## 15. 命名收敛

新协议落地后，建议全面收敛命名：

- `gate` -> `interaction`
- `human_gate_*` -> `interaction_*`
- `resolveGate / rejectGate / resumeWaiting` -> `submitInteraction`
- `activeGate` -> `activeInteraction`
- `pendingUiGates` -> `pendingInteractions`

## 16. 风险点

本次改造的主要风险：

1. 状态机回归
2. 提交恢复错误
3. 前端聚焦错位
4. `terminal_wait` 被误做成普通表单交互

## 17. 测试要求

### 17.1 Runtime 单测

- 不同 source 正确编译为 `InteractionRequest`
- `interactionKind / riskLevel / blockingMode` 映射正确
- 单 run 只能有一个 active interaction

### 17.2 Runtime 恢复测试

- `submitInteraction` 对不同 action 恢复正确
- 重复提交不会重复恢复
- 旧 request 提交被拒绝

### 17.3 SSE / Snapshot 测试

- `interaction_requested -> resolved/rejected/expired`
- reattach snapshot 能恢复当前 activeInteraction
- `run_state_changed` 与 interaction 状态保持一致

### 17.4 前端模型测试

- pending queue 正确增删替换
- AI panel 能按 `requestedRunId` 聚焦
- `terminal_wait` 与普通 `collect_input` 呈现不同

## 18. 完成标准

本设计完成后的系统应满足：

- 所有 AI-用户结构化交互统一走 `interaction_request`
- runtime 成为唯一交互协议生产者
- 前端只消费 schema，不自行定义安全语义
- `approval / parameter_confirmation / terminal_input` 旧模型完全退场
- pending queue、AI panel、reattach、恢复执行都基于新协议运行

## 19. 结论

OpsClaw 不再继续围绕几类专用 gate 扩展 HITL，而是升级为一套 runtime-owned 的统一交互协议。

这套协议是：

- 通用的
- 可控的
- 可审计的
- 可恢复的
- 可演进的

它既能覆盖当前 HITL，也能成为后续高危确认与所有 AI-用户结构化交互的底层基础协议。
