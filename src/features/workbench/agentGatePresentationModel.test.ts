import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAgentRunDisplayState,
  isTerminalWaitInteraction,
  isUiResolvableInteraction,
} from './agentGatePresentationModel.js';

void test('isUiResolvableInteraction only returns true for non-terminal interactions', () => {
  assert.equal(isUiResolvableInteraction(null), false);
  assert.equal(
    isUiResolvableInteraction({
      id: 'interaction-1',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'open',
      interactionKind: 'approval',
      riskLevel: 'high',
      blockingMode: 'hard_block',
      title: '操作审批',
      message: '需要用户批准。',
      schemaVersion: 'v1',
      fields: [],
      actions: [],
      openedAt: 1,
      deadlineAt: null,
      metadata: {},
    }),
    true
  );
  assert.equal(
    isUiResolvableInteraction({
      id: 'interaction-2',
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
      openedAt: 1,
      deadlineAt: null,
      metadata: {},
    }),
    false
  );
});

void test('isTerminalWaitInteraction only returns true for terminal_wait interactions', () => {
  assert.equal(isTerminalWaitInteraction(null), false);
  assert.equal(
    isTerminalWaitInteraction({
      id: 'interaction-1',
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
      openedAt: 1,
      deadlineAt: null,
      metadata: {},
    }),
    true
  );
});

void test('getAgentRunDisplayState maps blocking mode before legacy run state', () => {
  assert.equal(
    getAgentRunDisplayState({
      state: 'waiting_for_human',
      executionState: 'blocked_by_interaction',
      blockingMode: 'interaction',
    }),
    'awaiting_user_action'
  );
  assert.equal(
    getAgentRunDisplayState({
      state: 'waiting_for_human',
      executionState: 'blocked_by_terminal',
      blockingMode: 'terminal_wait',
    }),
    'waiting_terminal'
  );
  assert.equal(
    getAgentRunDisplayState({
      state: 'completed',
      executionState: 'completed',
      blockingMode: 'none',
    }),
    'completed'
  );
});
