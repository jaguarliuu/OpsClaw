import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPendingUiGateItems,
  reducePendingUiGates,
} from './agentPendingGateModel.js';

void test('buildPendingUiGateItems only includes blocking non-terminal interactions', () => {
  const items = buildPendingUiGateItems([
    {
      id: 'interaction-terminal',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'open',
      interactionKind: 'terminal_wait',
      riskLevel: 'medium',
      blockingMode: 'hard_block',
      title: '等待终端交互',
      message: '请在终端中继续输入。',
      schemaVersion: 'v1',
      fields: [],
      actions: [],
      openedAt: 3,
      deadlineAt: null,
      metadata: {},
    },
    {
      id: 'interaction-approval',
      runId: 'run-2',
      sessionId: 'session-1',
      status: 'open',
      interactionKind: 'approval',
      riskLevel: 'high',
      blockingMode: 'hard_block',
      title: '操作审批',
      message: '需要批准。',
      schemaVersion: 'v1',
      fields: [],
      actions: [],
      openedAt: 1,
      deadlineAt: null,
      metadata: {},
    },
  ]);

  assert.deepEqual(
    items.map((item) => ({
      requestId: item.requestId,
      interactionKind: item.interactionKind,
      title: item.title,
    })),
    [
      {
        requestId: 'interaction-approval',
        interactionKind: 'approval',
        title: '操作审批',
      },
    ]
  );
});

void test('reducePendingUiGates replaces the previous interaction when the same run opens a new one', () => {
  const first = reducePendingUiGates([], {
    type: 'interaction_requested',
    runId: 'run-1',
    request: {
      id: 'interaction-1',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'open',
      interactionKind: 'approval',
      riskLevel: 'high',
      blockingMode: 'hard_block',
      title: '操作审批',
      message: 'first',
      schemaVersion: 'v1',
      fields: [],
      actions: [],
      openedAt: 1,
      deadlineAt: null,
      metadata: {},
    },
    timestamp: 1,
  });

  const second = reducePendingUiGates(first, {
    type: 'interaction_requested',
    runId: 'run-1',
    request: {
      id: 'interaction-2',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'open',
      interactionKind: 'collect_input',
      riskLevel: 'medium',
      blockingMode: 'soft_block',
      title: '补全关键参数',
      message: 'second',
      schemaVersion: 'v1',
      fields: [],
      actions: [],
      openedAt: 2,
      deadlineAt: null,
      metadata: {},
    },
    timestamp: 2,
  });

  assert.deepEqual(
    second.map((item) => ({
      requestId: item.requestId,
      interactionKind: item.interactionKind,
      summary: item.summary,
    })),
    [
      {
        requestId: 'interaction-2',
        interactionKind: 'collect_input',
        summary: 'second',
      },
    ]
  );
});
