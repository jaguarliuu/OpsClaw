import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { AgentTimelineItem, InteractionRequest } from './types.agent.js';
import {
  applyAgentEventToTimeline,
  projectAgentSnapshotToEventState,
  reduceAgentEventState,
  mapAgentEventToTimelineItem,
} from './useAgentRunModel.js';

function makeInteractionRequest(
  overrides: Partial<InteractionRequest> = {}
): InteractionRequest {
  return {
    id: 'interaction-1',
    runId: 'run-1',
    sessionId: 'session-1',
    status: 'open',
    interactionKind: 'approval',
    riskLevel: 'high',
    blockingMode: 'hard_block',
    title: '操作审批',
    message: '该操作需要用户审批后执行。',
    schemaVersion: 'v1',
    fields: [],
    actions: [
      { id: 'approve', label: '继续执行', kind: 'approve', style: 'danger' },
      { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
    ],
    openedAt: 1,
    deadlineAt: null,
    metadata: {},
    ...overrides,
  };
}

void test('stream event union no longer contains human_gate events', () => {
  const source = readFileSync(new URL('./types.agent.ts', import.meta.url), 'utf8');

  assert.equal(source.includes('human_gate_opened'), false);
  assert.equal(source.includes('human_gate_resolved'), false);
  assert.equal(source.includes("kind: 'human_gate'"), false);
});

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

void test('interaction_requested updates activeInteraction and pendingInteractions', () => {
  const state = reduceAgentEventState(
    {
      runId: null,
      runState: 'running',
      executionState: 'running',
      blockingMode: 'none',
      activeInteraction: null,
      pendingInteractions: [],
      error: null,
    },
    {
      type: 'interaction_requested',
      runId: 'run-1',
      request: makeInteractionRequest({ interactionKind: 'approval' }),
      timestamp: 1,
    }
  );

  assert.equal(state.activeInteraction?.interactionKind, 'approval');
  assert.equal(state.pendingInteractions.length, 1);
});

void test('reduceAgentEventState tracks execution semantics from run_state_changed events', () => {
  const state = reduceAgentEventState(
    {
      runId: 'run-1',
      runState: 'running',
      executionState: 'running',
      blockingMode: 'none',
      activeInteraction: null,
      pendingInteractions: [],
      error: 'old error',
    },
    {
      type: 'run_state_changed',
      runId: 'run-1',
      state: 'waiting_for_human',
      executionState: 'blocked_by_interaction',
      blockingMode: 'interaction',
      timestamp: Date.now(),
    }
  );

  assert.deepEqual(state, {
    runId: 'run-1',
    runState: 'waiting_for_human',
    executionState: 'blocked_by_interaction',
    blockingMode: 'interaction',
    activeInteraction: null,
    pendingInteractions: [],
    error: 'old error',
  });
});

void test('interaction_resolved clears activeInteraction and pendingInteractions', () => {
  const afterResolve = reduceAgentEventState(
    {
      runId: 'run-1',
      runState: 'waiting_for_human',
      executionState: 'blocked_by_interaction',
      blockingMode: 'interaction',
      activeInteraction: makeInteractionRequest(),
      pendingInteractions: [
        {
          requestId: 'interaction-1',
          gateId: 'interaction-1',
          runId: 'run-1',
          sessionId: 'session-1',
          interactionKind: 'approval',
          kind: 'approval',
          riskLevel: 'high',
          title: '操作审批',
          summary: '需要批准',
          openedAt: 1,
          request: makeInteractionRequest(),
        },
      ],
      error: null,
    },
    {
      type: 'interaction_resolved',
      runId: 'run-1',
      request: makeInteractionRequest({ status: 'resolved' }),
      timestamp: 2,
    }
  );

  assert.equal(afterResolve.activeInteraction, null);
  assert.deepEqual(afterResolve.pendingInteractions, []);
});

void test('projectAgentSnapshotToEventState derives pending interactions from activeInteraction snapshot state', () => {
  const state = projectAgentSnapshotToEventState(
    {
      runId: null,
      runState: null,
      executionState: null,
      blockingMode: null,
      activeInteraction: null,
      pendingInteractions: [],
      error: 'old error',
    },
    {
      runId: 'run-1',
      sessionId: 'session-1',
      task: '重启 nginx 服务',
      state: 'waiting_for_human',
      executionState: 'blocked_by_interaction',
      blockingMode: 'interaction',
      activeInteraction: makeInteractionRequest({
        id: 'interaction-1',
        message: '需要批准',
      }),
    }
  );

  assert.deepEqual(
    state.pendingInteractions.map((item) => ({
      requestId: item.requestId,
      interactionKind: item.interactionKind,
      title: item.title,
      summary: item.summary,
    })),
    [
      {
        requestId: 'interaction-1',
        interactionKind: 'approval',
        title: '操作审批',
        summary: '需要批准',
      },
    ]
  );
  assert.equal(state.error, null);
});

void test('projectAgentSnapshotToEventState ignores non-open interactions when rebuilding the queue', () => {
  const state = projectAgentSnapshotToEventState(
    {
      runId: 'run-1',
      runState: 'waiting_for_human',
      executionState: 'blocked_by_interaction',
      blockingMode: 'interaction',
      activeInteraction: null,
      pendingInteractions: [],
      error: null,
    },
    {
      runId: 'run-1',
      sessionId: 'session-1',
      task: '重启 nginx 服务',
      state: 'suspended',
      executionState: 'suspended',
      blockingMode: 'none',
      activeInteraction: makeInteractionRequest({
        status: 'resolved',
      }),
    }
  );

  assert.deepEqual(state.pendingInteractions, []);
  assert.equal(state.activeInteraction?.status, 'resolved');
});
