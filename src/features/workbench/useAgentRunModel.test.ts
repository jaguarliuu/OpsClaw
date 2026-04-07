import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentTimelineItem } from './types.agent.js';
import {
  applyAgentEventToTimeline,
  projectAgentSnapshotToEventState,
  reduceAgentEventState,
  mapAgentEventToTimelineItem,
} from './useAgentRunModel.js';

void test('applyAgentEventToTimeline merges assistant_message_delta events into a single assistant item for the same step', () => {
  const firstPass = applyAgentEventToTimeline(
    [],
    {
      type: 'assistant_message_delta',
      runId: 'run-1',
      delta: '正在',
      step: 1,
      timestamp: Date.now(),
    },
    () => 'assistant-1'
  );

  assert.deepEqual(firstPass, [
    {
      id: 'assistant-1',
      kind: 'assistant',
      text: '正在',
      step: 1,
    },
  ]);

  const secondPass = applyAgentEventToTimeline(
    firstPass,
    {
      type: 'assistant_message_delta',
      runId: 'run-1',
      delta: '检查磁盘',
      step: 1,
      timestamp: Date.now(),
    },
    () => 'assistant-2'
  );

  assert.deepEqual(secondPass, [
    {
      id: 'assistant-1',
      kind: 'assistant',
      text: '正在检查磁盘',
      step: 1,
    },
  ]);
});

void test('applyAgentEventToTimeline lets assistant_message replace the merged delta text with the finalized content', () => {
  const initialItems: AgentTimelineItem[] = [
    {
      id: 'assistant-1',
      kind: 'assistant',
      text: '正在检查',
      step: 1,
    },
  ];

  const items = applyAgentEventToTimeline(
    initialItems,
    {
      type: 'assistant_message',
      runId: 'run-1',
      text: '正在检查磁盘空间并准备给出结论。',
      step: 1,
      timestamp: Date.now(),
    },
    () => 'assistant-2'
  );

  assert.deepEqual(items, [
    {
      id: 'assistant-1',
      kind: 'assistant',
      text: '正在检查磁盘空间并准备给出结论。',
      step: 1,
    },
  ]);
});

void test('maps approval_required events into warning timeline items while preserving policy metadata', () => {
  const item = mapAgentEventToTimelineItem(
    {
      type: 'approval_required',
      runId: 'run-1',
      step: 2,
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      reason: '命令命中敏感操作策略，需要用户审批后执行。',
      policy: {
        action: 'require_approval',
        matches: [
          {
            ruleId: 'service.restart',
            title: '服务重启',
            severity: 'high',
            reason: '命令会重启或停止服务，可能影响在线流量。',
            matchedText: 'systemctl restart',
          },
        ],
      },
      timestamp: Date.now(),
    },
    'item-1'
  );

  assert.deepEqual(item, {
    id: 'item-1',
    kind: 'warning',
    text: '工具 session.run_command 需要审批：命令命中敏感操作策略，需要用户审批后执行。',
    step: 2,
    policy: {
      action: 'require_approval',
      matches: [
        {
          ruleId: 'service.restart',
          title: '服务重启',
          severity: 'high',
          reason: '命令会重启或停止服务，可能影响在线流量。',
          matchedText: 'systemctl restart',
        },
      ],
    },
  });
});

void test('maps failed tool results while preserving policy metadata on the result envelope', () => {
  const item = mapAgentEventToTimelineItem(
    {
      type: 'tool_execution_finished',
      runId: 'run-1',
      step: 3,
      toolCallId: 'call-2',
      toolName: 'session.run_command',
      result: {
        toolName: 'session.run_command',
        toolCallId: 'call-2',
        ok: false,
        error: {
          code: 'tool_denied',
          message: '命令命中敏感操作策略，当前模式仅允许只读或低风险命令。',
          retryable: false,
        },
        meta: {
          startedAt: 1,
          completedAt: 2,
          durationMs: 1,
          policy: {
            action: 'deny',
            matches: [
              {
                ruleId: 'shell.delete.recursive',
                title: '递归删除',
                severity: 'critical',
                reason: '命令包含递归删除，可能造成不可逆数据丢失。',
                matchedText: 'rm -rf',
              },
            ],
          },
        },
      },
      timestamp: Date.now(),
    },
    'item-2'
  );

  assert.equal(item?.kind, 'tool_result');
  assert.equal(item?.result.meta.policy?.action, 'deny');
  assert.equal(item?.result.meta.policy?.matches[0]?.ruleId, 'shell.delete.recursive');
});

void test('returns null for run_started because it should not append a timeline item', () => {
  assert.equal(
    mapAgentEventToTimelineItem(
      {
        type: 'run_started',
        runId: 'run-1',
        sessionId: 'session-1',
        task: 'check disk',
        timestamp: Date.now(),
      },
      'item-3'
    ),
    null
  );
});

void test('maps human_gate_opened events into dedicated human_gate timeline items', () => {
  const item = mapAgentEventToTimelineItem(
    {
      type: 'human_gate_opened',
      runId: 'run-1',
      gate: {
        id: 'gate-1',
        runId: 'run-1',
        sessionId: 'session-1',
        kind: 'terminal_input',
        status: 'open',
        reason: '命令正在等待你在终端中继续输入。',
        openedAt: 1,
        deadlineAt: 2,
        presentationMode: 'terminal_wait',
        payload: {
          toolCallId: 'call-1',
          toolName: 'session.run_command',
          command: 'sudo passwd root',
          timeoutMs: 300_000,
        },
      },
      timestamp: Date.now(),
    },
    'item-gate-1'
  );

  assert.deepEqual(item, {
    id: 'item-gate-1',
    kind: 'human_gate',
    runId: 'run-1',
    gate: {
      id: 'gate-1',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'terminal_input',
      status: 'open',
      reason: '命令正在等待你在终端中继续输入。',
      openedAt: 1,
      deadlineAt: 2,
      presentationMode: 'terminal_wait',
      payload: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        command: 'sudo passwd root',
        timeoutMs: 300_000,
      },
    },
  });
});

void test('applyAgentEventToTimeline appends human_gate status transitions as timeline entries', () => {
  const items = applyAgentEventToTimeline(
    [],
    {
      type: 'human_gate_expired',
      runId: 'run-1',
      gate: {
        id: 'gate-1',
        runId: 'run-1',
        sessionId: 'session-1',
        kind: 'terminal_input',
        status: 'expired',
        reason: '命令等待人工输入超时，Agent 已停止等待结果。',
        openedAt: 1,
        deadlineAt: 2,
        presentationMode: 'terminal_wait',
        payload: {
          toolCallId: 'call-1',
          toolName: 'session.run_command',
          command: 'sudo passwd root',
          timeoutMs: 300_000,
        },
      },
      timestamp: Date.now(),
    },
    () => 'item-gate-expired'
  );

  assert.equal(items[0]?.kind, 'human_gate');
  assert.equal(items[0]?.gate.status, 'expired');
});

void test('reduceAgentEventState centralizes run state and gate projection for lifecycle events', () => {
  const waitingState = reduceAgentEventState(
    {
      runId: null,
      runState: 'running',
      executionState: 'running',
      blockingMode: 'none',
      activeGate: null,
      pendingUiGates: [],
      error: null,
    },
    {
      type: 'human_gate_opened',
      runId: 'run-1',
      gate: {
        id: 'gate-1',
        runId: 'run-1',
        sessionId: 'session-1',
        kind: 'terminal_input',
        status: 'open',
        reason: '命令正在等待你在终端中继续输入。',
        openedAt: 1,
        deadlineAt: 2,
        presentationMode: 'terminal_wait',
        payload: {
          toolCallId: 'call-1',
          toolName: 'session.run_command',
          command: 'sudo passwd root',
          timeoutMs: 300_000,
        },
      },
      timestamp: Date.now(),
    }
  );

  assert.equal(waitingState.activeGate?.id, 'gate-1');
  assert.equal(waitingState.runState, 'running');
  assert.deepEqual(waitingState.pendingUiGates, []);

  const failedState = reduceAgentEventState(waitingState, {
    type: 'run_failed',
    runId: 'run-1',
    error: 'Agent 执行失败',
    timestamp: Date.now(),
  });

  assert.deepEqual(failedState, {
    runId: 'run-1',
    runState: 'failed',
    executionState: 'failed',
    blockingMode: 'none',
    activeGate: null,
    pendingUiGates: [],
    error: 'Agent 执行失败',
  });
});

void test('reduceAgentEventState tracks execution semantics from run_state_changed events', () => {
  const state = reduceAgentEventState(
    {
      runId: 'run-1',
      runState: 'running',
      executionState: 'running',
      blockingMode: 'none',
      activeGate: null,
      pendingUiGates: [],
      error: 'old error',
    },
    {
      type: 'run_state_changed',
      runId: 'run-1',
      state: 'waiting_for_human',
      executionState: 'blocked_by_ui_gate',
      blockingMode: 'ui_gate',
      timestamp: Date.now(),
    }
  );

  assert.deepEqual(state, {
    runId: 'run-1',
    runState: 'waiting_for_human',
    executionState: 'blocked_by_ui_gate',
    blockingMode: 'ui_gate',
    activeGate: null,
    pendingUiGates: [],
    error: 'old error',
  });
});

void test('reduceAgentEventState maintains a pending UI gate queue from human gate events', () => {
  const afterOpen = reduceAgentEventState(
    {
      runId: 'run-1',
      runState: 'waiting_for_human',
      executionState: 'blocked_by_ui_gate',
      blockingMode: 'ui_gate',
      activeGate: null,
      pendingUiGates: [],
      error: null,
    },
    {
      type: 'human_gate_opened',
      runId: 'run-1',
      gate: {
        id: 'gate-1',
        runId: 'run-1',
        sessionId: 'session-1',
        kind: 'parameter_confirmation',
        status: 'open',
        reason: '请确认用户名',
        openedAt: 1,
        deadlineAt: null,
        presentationMode: 'inline_ui_action',
        payload: {
          toolCallId: 'call-1',
          toolName: 'session.run_command',
          command: 'useradd ops-admin',
          intentKind: 'user_management',
          fields: [],
        },
      },
      timestamp: 1,
    }
  );

  assert.deepEqual(afterOpen.pendingUiGates, [
    {
      gateId: 'gate-1',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'parameter_confirmation',
      title: '待补全',
      summary: '请确认用户名',
      openedAt: 1,
    },
  ]);

  const afterResolve = reduceAgentEventState(afterOpen, {
    type: 'human_gate_resolved',
    runId: 'run-1',
    gate: {
      id: 'gate-1',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'parameter_confirmation',
      status: 'resolved',
      reason: '请确认用户名',
      openedAt: 1,
      deadlineAt: null,
      presentationMode: 'inline_ui_action',
      payload: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        command: 'useradd ops-admin',
        intentKind: 'user_management',
        fields: [],
      },
    },
    timestamp: 2,
  });

  assert.deepEqual(afterResolve.pendingUiGates, []);
  assert.equal(afterResolve.activeGate, null);
});

void test('projectAgentSnapshotToEventState derives pending UI gates from an open UI snapshot gate', () => {
  const state = projectAgentSnapshotToEventState(
    {
      runId: null,
      runState: null,
      executionState: null,
      blockingMode: null,
      activeGate: null,
      pendingUiGates: [],
      error: 'old error',
    },
    {
      runId: 'run-1',
      sessionId: 'session-1',
      task: '重启 nginx 服务',
      state: 'waiting_for_human',
      executionState: 'blocked_by_ui_gate',
      blockingMode: 'ui_gate',
      openGate: {
        id: 'gate-1',
        runId: 'run-1',
        sessionId: 'session-1',
        kind: 'approval',
        status: 'open',
        reason: '需要批准',
        openedAt: 1,
        deadlineAt: null,
        presentationMode: 'inline_ui_action',
        payload: {
          toolCallId: 'call-1',
          toolName: 'session.run_command',
          arguments: {},
          policy: { action: 'require_approval', matches: [] },
        },
      },
    }
  );

  assert.deepEqual(state.pendingUiGates, [
    {
      gateId: 'gate-1',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'approval',
      title: '待批准',
      summary: '需要批准',
      openedAt: 1,
    },
  ]);
  assert.equal(state.error, null);
});

void test('projectAgentSnapshotToEventState ignores non-open UI gates when rebuilding the queue', () => {
  const state = projectAgentSnapshotToEventState(
    {
      runId: 'run-1',
      runState: 'waiting_for_human',
      executionState: 'blocked_by_ui_gate',
      blockingMode: 'ui_gate',
      activeGate: null,
      pendingUiGates: [],
      error: null,
    },
    {
      runId: 'run-1',
      sessionId: 'session-1',
      task: '重启 nginx 服务',
      state: 'suspended',
      executionState: 'suspended',
      blockingMode: 'none',
      openGate: {
        id: 'gate-1',
        runId: 'run-1',
        sessionId: 'session-1',
        kind: 'approval',
        status: 'resolved',
        reason: '需要批准',
        openedAt: 1,
        deadlineAt: null,
        presentationMode: 'inline_ui_action',
        payload: {
          toolCallId: 'call-1',
          toolName: 'session.run_command',
          arguments: {},
          policy: { action: 'require_approval', matches: [] },
        },
      },
    }
  );

  assert.deepEqual(state.pendingUiGates, []);
  assert.equal(state.activeGate?.status, 'resolved');
});
