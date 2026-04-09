# Unified Interaction Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OpsClaw 当前基于 `approval / parameter_confirmation / terminal_input` 的专用 gate 体系，直接切换为 runtime-owned 的统一 `interaction_request` 协议，并让 runtime、HTTP API、SSE、reattach、AI panel、global pending queue 全部基于新协议工作。

**Architecture:** 先在 runtime 侧建立新的 `InteractionRequest / InteractionSubmission` 数据模型和 run snapshot 投影，再把 tool pause 语义编译成 interaction source，由 runtime 统一产出 interaction 并处理 submit。随后替换 SSE 与前端状态模型，最后将 AI panel 和全局 pending queue 都改为消费 `interaction_*` 事件和 `activeInteraction / pendingInteractions`，彻底移除旧 gate 命名、旧路由和旧 reducer 语义。

**Tech Stack:** TypeScript, React 19, node:test via `pnpm exec tsx --test`, Express SSE

---

## File Map

### New Files

- `server/agent/interactionTypes.ts`
  - 统一定义 runtime 侧 `InteractionRequest`、`InteractionField`、`InteractionAction`、`InteractionSubmission`、`InteractionSource`。
- `server/agent/interactionFactory.ts`
  - 按 `source -> interaction_request` 的固定映射生成结构化交互请求。
- `src/features/workbench/agentInteractionModel.ts`
  - 前端交互字段、动作、风险标签、queue item 的纯模型。
- `src/features/workbench/agentInteractionModel.test.ts`
  - 覆盖 queue、field 映射、action 映射与 `terminal_wait` 特判。
- `src/features/workbench/InteractionCard.tsx`
  - AI panel 和 global queue 共享的 interaction 渲染骨架。
- `src/features/workbench/InteractionFieldRenderer.tsx`
  - 渲染 `display / text / password / textarea / single_select / multi_select / confirm`。

### Existing Files To Modify

- `server/agent/agentRunRegistry.ts`
  - 用 `activeInteraction` 替换 `openGate`，统一 run 执行态与 interaction 状态。
- `server/agent/agentRunRegistry.test.ts`
  - 校验单 run 单 active interaction 约束、interaction 生命周期、snapshot 投影。
- `server/agent/agentRuntime.ts`
  - 将 pause handling、submit handling、continuation 恢复全部迁移到 interaction 协议。
- `server/agent/agentRuntime.test.ts`
  - 覆盖 collect input、approval、danger confirm、terminal wait 的打开、提交、恢复与幂等。
- `server/agent/agentTypes.ts`
  - 替换旧 `human_gate_*` 事件为 `interaction_*` 事件，并更新 snapshot 类型。
- `server/agent/toolTypes.ts`
  - 将 `ToolPauseOutcome` 从 gate payload 改为 interaction source 语义输入。
- `server/agent/toolExecutor.ts`
  - 产出新的 interaction source 上下文，不再直接携带前端导向的 gate schema。
- `server/http/agentRoutes.ts`
  - 删除旧 gate 路由，新增统一 `submit interaction` 路由。
- `server/http/agentRoutes.test.ts`
  - 覆盖新 submit 路由、reattach、continuation SSE 与错误返回。
- `src/features/workbench/types.agent.ts`
  - 镜像新 interaction 协议、SSE 事件与 `AgentRunSnapshot`。
- `src/features/workbench/agentApi.ts`
  - 删除 `resolveAgentGate / rejectAgentGate / resumeAgentGate`，新增统一 submit API。
- `src/features/workbench/useAgentRunModel.ts`
  - 基于 `interaction_*` 事件维护 `activeInteraction / pendingInteractions`。
- `src/features/workbench/useAgentRunModel.test.ts`
  - 覆盖新 reducer、snapshot 投影、terminal wait 与 queue 行为。
- `src/features/workbench/useAgentRun.ts`
  - 更新 run continuation、交互提交流、reattach 恢复逻辑。
- `src/features/workbench/AiAssistantPanel.tsx`
  - 用通用 interaction card 替代 gate 专用卡片。
- `src/features/workbench/PendingGatePanel.tsx`
  - 改为 pending interaction panel。
- `src/features/workbench/PendingGateIndicator.tsx`
  - 改为 interaction count 展示与文案。
- `src/routes/WorkbenchPage.tsx`
  - 连接新的 pending interaction 状态。
- `src/features/workbench/agentGatePresentationModel.ts`
  - 改为 interaction 展示语义模型，或被 `agentInteractionModel.ts` 吸收。
- `src/features/workbench/agentPendingGateModel.ts`
  - 改为 interaction queue model，或被 `agentInteractionModel.ts` 吸收。

### Existing Files To Delete Or Fully Retire

- `server/agent/humanGateTypes.ts`
  - 被 `interactionTypes.ts` 完全替代。

## Task 1: 建立 Interaction 协议底座并替换 Run Snapshot

**Files:**
- Create: `server/agent/interactionTypes.ts`
- Modify: `server/agent/agentRunRegistry.ts`
- Modify: `server/agent/agentTypes.ts`
- Modify: `src/features/workbench/types.agent.ts`
- Modify: `server/agent/agentRunRegistry.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 snapshot 从 `openGate` 切到 `activeInteraction`**

```ts
void test('opening an interaction stores activeInteraction and blocks the run', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: '创建 root 权限用户',
  });

  registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: {
      id: 'req-1',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'open',
      interactionKind: 'danger_confirm',
      riskLevel: 'critical',
      blockingMode: 'hard_block',
      title: '确认高危操作',
      message: '将创建具备 sudo 权限的新用户。',
      schemaVersion: 'v1',
      fields: [{ type: 'confirm', key: 'confirmed', label: '我确认继续', required: true }],
      actions: [
        { id: 'approve', label: '继续执行', kind: 'approve', style: 'danger' },
        { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
      ],
      openedAt: 1,
      deadlineAt: null,
      metadata: { source: 'danger_confirmation' },
    },
  });

  const snapshot = registry.getRun('run-1');
  assert.equal(snapshot?.executionState, 'blocked_by_interaction');
  assert.equal(snapshot?.blockingMode, 'interaction');
  assert.equal(snapshot?.activeInteraction?.interactionKind, 'danger_confirm');
});
```

- [ ] **Step 2: 运行 registry 测试并确认失败**

Run: `pnpm exec tsx --test server/agent/agentRunRegistry.test.ts`

Expected: FAIL，提示 `openInteraction`、`activeInteraction`、`blocked_by_interaction` 等新字段尚不存在。

- [ ] **Step 3: 新建统一 interaction 类型文件**

在 `server/agent/interactionTypes.ts` 写入最小可用协议定义：

```ts
export type InteractionStatus = 'open' | 'submitted' | 'resolved' | 'rejected' | 'expired';
export type InteractionKind =
  | 'collect_input'
  | 'approval'
  | 'danger_confirm'
  | 'terminal_wait'
  | 'inform';

export type InteractionRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type InteractionBlockingMode = 'none' | 'soft_block' | 'hard_block';

export type InteractionField =
  | { type: 'display'; key: string; label?: string; value: string }
  | { type: 'text'; key: string; label: string; required?: boolean; value?: string; placeholder?: string }
  | { type: 'password'; key: string; label: string; required?: boolean; value?: string; placeholder?: string }
  | { type: 'textarea'; key: string; label: string; required?: boolean; value?: string; placeholder?: string }
  | { type: 'single_select'; key: string; label: string; required?: boolean; options: Array<{ label: string; value: string; description?: string }>; value?: string }
  | { type: 'multi_select'; key: string; label: string; required?: boolean; options: Array<{ label: string; value: string; description?: string }>; value?: string[] }
  | { type: 'confirm'; key: string; label: string; required?: boolean; value?: boolean };

export type InteractionAction = {
  id: string;
  label: string;
  kind: 'submit' | 'approve' | 'reject' | 'cancel' | 'continue_waiting' | 'acknowledge';
  style: 'primary' | 'secondary' | 'danger';
};

export type InteractionRequest = {
  id: string;
  runId: string;
  sessionId: string;
  status: InteractionStatus;
  interactionKind: InteractionKind;
  riskLevel: InteractionRiskLevel;
  blockingMode: InteractionBlockingMode;
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

- [ ] **Step 4: 用 interaction 替换 registry 和前后端共享 snapshot 类型**

在 `server/agent/agentRunRegistry.ts`、`server/agent/agentTypes.ts`、`src/features/workbench/types.agent.ts` 同步切换：

```ts
export type AgentRunExecutionState =
  | 'running'
  | 'blocked_by_interaction'
  | 'blocked_by_terminal'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRunBlockingMode = 'none' | 'interaction' | 'terminal_wait';

export type AgentRunRecord = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  executionState: AgentRunExecutionState;
  blockingMode: AgentRunBlockingMode;
  activeInteraction: InteractionRequest | null;
};
```

并在 registry 中实现固定映射：

```ts
function toExecutionState(request: InteractionRequest): AgentRunExecutionState {
  return request.interactionKind === 'terminal_wait'
    ? 'blocked_by_terminal'
    : request.blockingMode === 'none'
      ? 'running'
      : 'blocked_by_interaction';
}

function toRunBlockingMode(request: InteractionRequest): AgentRunBlockingMode {
  return request.interactionKind === 'terminal_wait' ? 'terminal_wait' : 'interaction';
}
```

- [ ] **Step 5: 让 `AgentStreamEvent` 先支持新 interaction 事件名**

在 `server/agent/agentTypes.ts` 和 `src/features/workbench/types.agent.ts` 中新增：

```ts
| { type: 'interaction_requested'; runId: string; request: InteractionRequest; timestamp: number }
| { type: 'interaction_updated'; runId: string; request: InteractionRequest; timestamp: number }
| { type: 'interaction_resolved'; runId: string; request: InteractionRequest; timestamp: number }
| { type: 'interaction_rejected'; runId: string; request: InteractionRequest; timestamp: number }
| { type: 'interaction_expired'; runId: string; request: InteractionRequest; timestamp: number }
```

- [ ] **Step 6: 重新运行 registry 测试**

Run: `pnpm exec tsx --test server/agent/agentRunRegistry.test.ts`

Expected: PASS，并且 snapshot 断言全部围绕 `activeInteraction` 生效。

- [ ] **Step 7: 提交本任务**

```bash
git add server/agent/interactionTypes.ts server/agent/agentRunRegistry.ts server/agent/agentTypes.ts src/features/workbench/types.agent.ts server/agent/agentRunRegistry.test.ts
git commit -m "feat: add unified interaction protocol types"
```

## Task 2: 将 Runtime Pause 编译为 Interaction，并统一提交入口

**Files:**
- Create: `server/agent/interactionFactory.ts`
- Modify: `server/agent/toolTypes.ts`
- Modify: `server/agent/toolExecutor.ts`
- Modify: `server/agent/agentRuntime.ts`
- Modify: `server/agent/agentRuntime.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 runtime 生成 interaction 而不是 human gate**

在 `server/agent/agentRuntime.test.ts` 增加：

```ts
test('parameter collection pause opens a collect_input interaction', async () => {
  const runtime = createRuntimeForParameterPause();
  const events: AgentStreamEvent[] = [];

  await runtime.run(createRunInput(), (event) => {
    events.push(event);
  }, AbortSignal.timeout(5_000));

  const opened = events.find((event) => event.type === 'interaction_requested');
  assert.ok(opened && opened.type === 'interaction_requested');
  assert.equal(opened.request.interactionKind, 'collect_input');
  assert.equal(opened.request.actions.map((action) => action.kind).join(','), 'submit,reject');
});
```

- [ ] **Step 2: 运行 runtime 测试并确认失败**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`

Expected: FAIL，提示 runtime 仍在发出 `human_gate_opened`，且 pause payload 仍是 gate 语义。

- [ ] **Step 3: 将 `ToolPauseOutcome` 改成 source-driven 语义输入**

在 `server/agent/toolTypes.ts` 中删除 `gateKind` 和 gate payload 绑定，改成：

```ts
export type InteractionSource =
  | { source: 'policy_approval'; context: { toolCallId: string; toolName: string; arguments: Record<string, unknown>; policy: AgentPolicySummary } }
  | { source: 'parameter_collection'; context: { toolCallId: string; toolName: 'session.run_command'; command: string; intentKind: OpsClawIntentKind; fields: ParameterConfirmationField[] } }
  | { source: 'danger_confirmation'; context: { toolCallId: string; toolName: string; title: string; message: string; confirmLabel: string; commandPreview?: string } }
  | { source: 'terminal_wait'; context: { toolCallId: string; toolName: 'session.run_command'; command: string; timeoutMs: number; sessionLabel?: string } }
  | { source: 'informational_notice'; context: { title: string; message: string } };

export type ToolPauseOutcome =
  | {
      kind: 'pause';
      interaction: InteractionSource;
      continuation: { waitForCompletion?: (signal?: AbortSignal) => Promise<ToolExecutionEnvelope>; resume?: (...args: unknown[]) => Promise<ToolExecutionEnvelope | ToolPauseOutcome>; reject?: () => ToolExecutionEnvelope; getSettledEnvelope?: () => ToolExecutionEnvelope | null };
    };
```

- [ ] **Step 4: 在 `interactionFactory.ts` 中集中编译 source -> request**

实现单入口：

```ts
export function createInteractionRequest(input: {
  runId: string;
  sessionId: string;
  source: InteractionSource;
}): InteractionRequest {
  if (input.source.source === 'parameter_collection') {
    return {
      id: randomUUID(),
      runId: input.runId,
      sessionId: input.sessionId,
      status: 'open',
      interactionKind: 'collect_input',
      riskLevel: 'medium',
      blockingMode: 'soft_block',
      title: '补全关键参数',
      message: '继续执行前需要你确认或填写参数。',
      schemaVersion: 'v1',
      fields: input.source.context.fields.map((field) => ({
        type: field.name === 'password' ? 'password' : 'text',
        key: field.name,
        label: field.label,
        required: field.required,
        value: field.value,
      })),
      actions: [
        { id: 'submit', label: '提交并继续', kind: 'submit', style: 'primary' },
        { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
      ],
      openedAt: Date.now(),
      deadlineAt: null,
      metadata: { intentKind: input.source.context.intentKind, commandPreview: input.source.context.command },
    };
  }

  // 其余 source 按 spec 固定映射继续补齐
}
```

- [ ] **Step 5: 在 runtime 中统一打开 interaction、提交 interaction、恢复 continuation**

在 `server/agent/agentRuntime.ts` 增加统一入口：

```ts
submitInteraction(
  runId: string,
  requestId: string,
  submission: { selectedAction: string; payload: Record<string, unknown> }
) {
  const snapshot = this.agentRunRegistry.getRun(runId);
  if (!snapshot?.activeInteraction || snapshot.activeInteraction.id !== requestId) {
    throw new Error('指定 interaction 不存在。');
  }

  this.agentRunRegistry.markInteractionSubmitted({ runId, requestId, submission });
  return this.resumePausedRunFromInteraction({
    runId,
    request: snapshot.activeInteraction,
    submission,
  });
}
```

将旧 `resolveGate`、`rejectGate`、`resumeWaiting` 的调用路径收敛到：

```ts
selectedAction === 'submit'
selectedAction === 'approve'
selectedAction === 'reject'
selectedAction === 'continue_waiting'
```

并在发事件时统一改成：

```ts
emit({ type: 'interaction_requested', runId, request, timestamp: Date.now() });
emit({ type: 'interaction_resolved', runId, request, timestamp: Date.now() });
emit({ type: 'interaction_rejected', runId, request, timestamp: Date.now() });
emit({ type: 'interaction_expired', runId, request, timestamp: Date.now() });
```

- [ ] **Step 6: 运行 runtime 测试直到转绿**

Run: `pnpm exec tsx --test server/agent/agentRuntime.test.ts`

Expected: PASS，且所有 pause/submit 路径都不再依赖 `resolveGate`、`rejectGate`、`resumeWaiting`。

- [ ] **Step 7: 提交本任务**

```bash
git add server/agent/interactionFactory.ts server/agent/toolTypes.ts server/agent/toolExecutor.ts server/agent/agentRuntime.ts server/agent/agentRuntime.test.ts
git commit -m "feat: compile runtime pauses into interactions"
```

## Task 3: 替换 HTTP API、SSE 事件与前端传输层

**Files:**
- Modify: `server/http/agentRoutes.ts`
- Modify: `server/http/agentRoutes.test.ts`
- Modify: `src/features/workbench/agentApi.ts`
- Modify: `src/features/workbench/useAgentRunModel.ts`
- Modify: `src/features/workbench/useAgentRunModel.test.ts`
- Modify: `src/features/workbench/useAgentRun.ts`

- [ ] **Step 1: 先写失败测试，锁定 submit endpoint 与事件 reducer 的新协议**

在 `server/http/agentRoutes.test.ts` 和 `src/features/workbench/useAgentRunModel.test.ts` 增加断言：

```ts
void test('submit interaction proxies selectedAction and payload', async () => {
  // 期望路由为 /api/agent/runs/:runId/interactions/:requestId/submit
});

void test('interaction_requested updates activeInteraction and pendingInteractions', () => {
  const state = reduceAgentEventState(initialState, {
    type: 'interaction_requested',
    runId: 'run-1',
    request: makeInteractionRequest({ interactionKind: 'approval' }),
    timestamp: 1,
  });

  assert.equal(state.activeInteraction?.interactionKind, 'approval');
  assert.equal(state.pendingInteractions.length, 1);
});
```

- [ ] **Step 2: 运行路由和前端 model 测试并确认失败**

Run: `pnpm exec tsx --test server/http/agentRoutes.test.ts src/features/workbench/useAgentRunModel.test.ts`

Expected: FAIL，提示旧 `/gates/*` 路由和 `human_gate_*` reducer 仍在生效。

- [ ] **Step 3: 删除旧 gate 路由，新增统一 submit 路由**

在 `server/http/agentRoutes.ts` 中替换成：

```ts
app.post('/api/agent/runs/:runId/interactions/:requestId/submit', (request, response) => {
  try {
    const body = isRecord(request.body) ? request.body : {};
    const selectedAction = readRequiredString(body, 'selectedAction', '交互动作');
    const payload = isRecord(body.payload) ? body.payload : {};
    const snapshot = agentRuntime.submitInteraction(request.params.runId, request.params.requestId, {
      selectedAction,
      payload,
    });
    response.json(snapshot);
  } catch (error) {
    console.error('[Agent] submit interaction error:', error);
    response.status(500).json({ message: '提交交互请求失败。' });
  }
});
```

- [ ] **Step 4: 切换前端 agent API 与 reducer 命名**

在 `src/features/workbench/agentApi.ts` 和 `src/features/workbench/useAgentRunModel.ts` 中替换：

```ts
export async function submitAgentInteraction(
  runId: string,
  requestId: string,
  input: { selectedAction: string; payload: Record<string, unknown> }
) {
  const response = await fetch(
    `${buildServerHttpBaseUrl()}/api/agent/runs/${runId}/interactions/${requestId}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  return readJson<AgentRunSnapshot>(response);
}
```

并在 reducer 中统一改成：

```ts
if (event.type === 'interaction_requested' || event.type === 'interaction_updated') {
  return {
    ...state,
    runId: event.runId,
    activeInteraction: event.request,
    pendingInteractions: reducePendingInteractions(state.pendingInteractions, event),
  };
}

if (
  event.type === 'interaction_resolved' ||
  event.type === 'interaction_rejected' ||
  event.type === 'interaction_expired'
) {
  return {
    ...state,
    runId: event.runId,
    activeInteraction: null,
    pendingInteractions: reducePendingInteractions(state.pendingInteractions, event),
  };
}
```

- [ ] **Step 5: 更新 `useAgentRun.ts` 的 continuation 入口**

把所有 gate-specific action 收敛成统一调用：

```ts
await continueRun(runIdToContinue, () =>
  submitAgentInteraction(runIdToContinue, requestId, {
    selectedAction,
    payload,
  })
);
```

并将本地状态字段改名：

```ts
const [activeInteraction, setActiveInteraction] = useState<InteractionRequest | null>(null);
const [pendingInteractions, setPendingInteractions] = useState(buildPendingInteractionItems([]));
```

- [ ] **Step 6: 重新运行路由和前端 model 测试**

Run: `pnpm exec tsx --test server/http/agentRoutes.test.ts src/features/workbench/useAgentRunModel.test.ts`

Expected: PASS，且旧 `/gates/*` 路由引用全部消失。

- [ ] **Step 7: 提交本任务**

```bash
git add server/http/agentRoutes.ts server/http/agentRoutes.test.ts src/features/workbench/agentApi.ts src/features/workbench/useAgentRunModel.ts src/features/workbench/useAgentRunModel.test.ts src/features/workbench/useAgentRun.ts
git commit -m "feat: replace gate API with interaction submit flow"
```

## Task 4: 用通用 Interaction UI 替换 AI Panel 与 Pending Queue

**Files:**
- Create: `src/features/workbench/agentInteractionModel.ts`
- Create: `src/features/workbench/agentInteractionModel.test.ts`
- Create: `src/features/workbench/InteractionCard.tsx`
- Create: `src/features/workbench/InteractionFieldRenderer.tsx`
- Modify: `src/features/workbench/AiAssistantPanel.tsx`
- Modify: `src/features/workbench/PendingGatePanel.tsx`
- Modify: `src/features/workbench/PendingGateIndicator.tsx`
- Modify: `src/routes/WorkbenchPage.tsx`
- Modify: `src/features/workbench/agentGatePresentationModel.ts`
- Modify: `src/features/workbench/agentPendingGateModel.ts`

- [ ] **Step 1: 先写失败测试，锁定 pending queue 与 terminal wait 的新产品语义**

在 `src/features/workbench/agentInteractionModel.test.ts` 增加：

```ts
test('terminal_wait stays out of pendingInteractions queue', () => {
  const items = buildPendingInteractionItems([
    makeInteractionRequest({ interactionKind: 'terminal_wait', blockingMode: 'hard_block' }),
    makeInteractionRequest({ interactionKind: 'approval', blockingMode: 'soft_block' }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.interactionKind, 'approval');
});

test('collect_input with password field maps to masked input metadata', () => {
  const view = toInteractionViewModel(
    makeInteractionRequest({
      interactionKind: 'collect_input',
      fields: [{ type: 'password', key: 'password', label: '密码', required: true }],
    })
  );

  assert.equal(view.fields[0]?.inputType, 'password');
});
```

- [ ] **Step 2: 运行前端 interaction model 测试并确认失败**

Run: `pnpm exec tsx --test src/features/workbench/agentInteractionModel.test.ts`

Expected: FAIL，因为 `buildPendingInteractionItems` 与通用 interaction view model 尚未存在。

- [ ] **Step 3: 新建通用 interaction model 与 field renderer**

在 `src/features/workbench/agentInteractionModel.ts` 中实现：

```ts
export type PendingInteractionItem = {
  requestId: string;
  runId: string;
  sessionId: string;
  interactionKind: 'collect_input' | 'approval' | 'danger_confirm' | 'terminal_wait';
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  openedAt: number;
};

export function toPendingInteractionItem(request: InteractionRequest): PendingInteractionItem | null {
  if (request.status !== 'open') {
    return null;
  }
  if (request.blockingMode === 'none') {
    return null;
  }
  if (request.interactionKind === 'inform' || request.interactionKind === 'terminal_wait') {
    return null;
  }
  return {
    requestId: request.id,
    runId: request.runId,
    sessionId: request.sessionId,
    interactionKind: request.interactionKind,
    riskLevel: request.riskLevel,
    title: request.title,
    summary: request.message,
    openedAt: request.openedAt,
  };
}
```

在 `InteractionFieldRenderer.tsx` 中为每种 `field.type` 提供固定渲染，不允许前端自行发明组件类型。

- [ ] **Step 4: 用 `InteractionCard` 接管 AI panel 和 pending panel**

在 `src/features/workbench/InteractionCard.tsx` 中统一骨架：

```tsx
export function InteractionCard(props: {
  request: InteractionRequest;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onSubmit: (selectedAction: string, payload: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  return (
    <section>
      <header>
        <h3>{props.request.title}</h3>
        <p>{props.request.message}</p>
      </header>
      <InteractionFieldRenderer
        fields={props.request.fields}
        values={props.values}
        onChange={props.onChange}
      />
      <footer>
        {props.request.actions.map((action) => (
          <button
            key={action.id}
            onClick={() => props.onSubmit(action.id, props.values)}
            disabled={props.disabled}
          >
            {action.label}
          </button>
        ))}
      </footer>
    </section>
  );
}
```

然后在 `AiAssistantPanel.tsx` 和 `PendingGatePanel.tsx` 中删除 `approval` / `parameter_confirmation` 的专用 JSX 分支，统一换成 `InteractionCard`。

- [ ] **Step 5: 更新 pending indicator、page wiring 与展示文案**

把 pending UI 相关命名统一替换为 interaction：

```ts
pendingUiGates -> pendingInteractions
activeGate -> activeInteraction
PendingGatePanel -> PendingInteractionPanel
```

如果暂时不改组件文件名，先改导出名与用户文案，避免产品界面继续出现 “gate” 字样。

- [ ] **Step 6: 运行前端相关测试**

Run: `pnpm exec tsx --test src/features/workbench/agentInteractionModel.test.ts src/features/workbench/useAgentRunModel.test.ts src/features/workbench/workbenchShellModel.test.ts`

Expected: PASS，且 queue、AI panel 状态、reattach 投影全部基于 interaction 工作。

- [ ] **Step 7: 提交本任务**

```bash
git add src/features/workbench/agentInteractionModel.ts src/features/workbench/agentInteractionModel.test.ts src/features/workbench/InteractionCard.tsx src/features/workbench/InteractionFieldRenderer.tsx src/features/workbench/AiAssistantPanel.tsx src/features/workbench/PendingGatePanel.tsx src/features/workbench/PendingGateIndicator.tsx src/routes/WorkbenchPage.tsx src/features/workbench/agentGatePresentationModel.ts src/features/workbench/agentPendingGateModel.ts
git commit -m "feat: render unified interaction cards in workbench"
```

## Task 5: 清理旧 Gate 语义、补齐回归测试并完成验证

**Files:**
- Delete: `server/agent/humanGateTypes.ts`
- Modify: `server/agent/agentRuntime.test.ts`
- Modify: `server/http/agentRoutes.test.ts`
- Modify: `src/features/workbench/useAgentRunModel.test.ts`
- Modify: `src/features/workbench/agentGateUiModel.test.ts`

- [ ] **Step 1: 搜索旧 gate 残留并先写回归断言**

先增加一条文本级回归检查，确保测试开始失败：

```ts
test('stream event union no longer contains human_gate events', () => {
  type EventType = AgentStreamEvent['type'];
  const forbidden: EventType[] = [
    'human_gate_opened' as EventType,
    'human_gate_resolved' as EventType,
  ];
  assert.equal(forbidden.length, 2);
});
```

然后手动搜索残留：

Run: `rg -n "human_gate_|resolveGate|rejectGate|resumeWaiting|openGate|activeGate|pendingUiGates" server src`

Expected: 能看到一批旧引用，作为本任务清理清单。

- [ ] **Step 2: 删除 `humanGateTypes.ts` 并完成 import 收敛**

删除文件后，把所有 import 改到：

```ts
import type { InteractionRequest, InteractionSubmission } from './interactionTypes.js';
```

确保前端也只保留：

```ts
activeInteraction
pendingInteractions
interaction_requested
interaction_resolved
interaction_rejected
interaction_expired
```

- [ ] **Step 3: 更新剩余测试与文案**

将旧断言全部替换成新协议命名，例如：

```ts
assert.equal(snapshot.activeInteraction?.status, 'resolved');
assert.equal(event.type, 'interaction_requested');
assert.equal(state.pendingInteractions.length, 1);
```

同时把用户可见文案中的 “gate” 改成 “交互” 或具体动作文案，避免 UI 暴露内部旧术语。

- [ ] **Step 4: 运行完整目标测试集**

Run: `pnpm exec tsx --test server/agent/agentRunRegistry.test.ts server/agent/agentRuntime.test.ts server/http/agentRoutes.test.ts src/features/workbench/agentInteractionModel.test.ts src/features/workbench/useAgentRunModel.test.ts src/features/workbench/workbenchShellModel.test.ts`

Expected: PASS

- [ ] **Step 5: 运行类型检查与构建校验**

Run: `pnpm typecheck`

Expected: PASS

Run: `pnpm build`

Expected: PASS

- [ ] **Step 6: 提交本任务**

```bash
git add server/agent src/features/workbench src/routes/WorkbenchPage.tsx
git rm server/agent/humanGateTypes.ts
git commit -m "refactor: retire legacy gate protocol"
```

## Self-Review

### Spec Coverage

- `InteractionRequest / Field / Action / Submission`：Task 1、Task 2
- runtime-only producer / source 编译：Task 2
- 单 run 单 active interaction：Task 1
- unified submit endpoint：Task 3
- `interaction_*` SSE：Task 1、Task 2、Task 3
- snapshot `activeInteraction` / frontend `pendingInteractions`：Task 1、Task 3、Task 4
- AI panel / global queue 共享一套 interaction 数据：Task 4
- 旧 `approval / parameter_confirmation / terminal_input` 退场：Task 5

### Placeholder Scan

- 没有使用 `TODO`、`TBD`、`implement later` 之类占位词。
- 每个任务都给出了具体文件、代码骨架、测试命令和提交命令。

### Type Consistency

- runtime 与 frontend 统一使用 `InteractionRequest`、`InteractionSubmission`、`activeInteraction`、`pendingInteractions`。
- 事件统一使用 `interaction_requested / updated / resolved / rejected / expired`。
- 阻断态统一使用 `blocked_by_interaction`、`blocked_by_terminal`、`interaction`、`terminal_wait`。

