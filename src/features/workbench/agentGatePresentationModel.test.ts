import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAgentRunDisplayState,
  isTerminalWaitGate,
  isUiResolvableGate,
} from './agentGatePresentationModel.js';

void test('isUiResolvableGate only returns true for inline_ui_action gates', () => {
  assert.equal(isUiResolvableGate(null), false);
  assert.equal(
    isUiResolvableGate({
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
    }),
    true
  );
  assert.equal(
    isUiResolvableGate({
      id: 'gate-2',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'terminal_input',
      status: 'open',
      reason: '等待终端输入',
      openedAt: 2,
      deadlineAt: 3,
      presentationMode: 'terminal_wait',
      payload: {
        toolCallId: 'call-2',
        toolName: 'session.run_command',
        command: 'sudo passwd root',
        timeoutMs: 300_000,
      },
    }),
    false
  );
});

void test('isTerminalWaitGate only returns true for terminal_wait gates', () => {
  assert.equal(isTerminalWaitGate(null), false);
  assert.equal(
    isTerminalWaitGate({
      id: 'gate-1',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'terminal_input',
      status: 'open',
      reason: '等待终端输入',
      openedAt: 1,
      deadlineAt: 2,
      presentationMode: 'terminal_wait',
      payload: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        command: 'sudo passwd root',
        timeoutMs: 300_000,
      },
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
