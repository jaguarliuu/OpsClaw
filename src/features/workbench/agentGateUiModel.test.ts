import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAgentSessionLock,
  getAgentSessionLockBannerText,
  getHumanGateDescription,
  getHumanGatePrimaryActionLabel,
  getHumanGateSecondaryActionLabel,
  getHumanGateTitle,
} from './agentGateUiModel.js';

void test('approval gates expose approve and reject action labels', () => {
  const gate = {
    id: 'gate-1',
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'approval' as const,
    status: 'open' as const,
    reason: '命令命中敏感操作策略，需要用户审批后执行。',
    openedAt: 1,
    deadlineAt: 2,
    payload: {
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      arguments: {
        command: 'systemctl restart nginx',
      },
      policy: {
        action: 'require_approval' as const,
        matches: [],
      },
    },
  };

  assert.equal(getHumanGatePrimaryActionLabel(gate), '批准');
  assert.equal(getHumanGateSecondaryActionLabel(gate), '拒绝');
  assert.equal(getHumanGateTitle(gate), '等待人工审批');
  assert.equal(getHumanGateDescription(gate), '该操作需要你的批准后才会继续执行。');
});

void test('expired terminal_input gates expose resume-waiting as the primary action', () => {
  const gate = {
    id: 'gate-2',
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'terminal_input' as const,
    status: 'expired' as const,
    reason: '命令等待人工输入超时，Agent 已停止等待结果。',
    openedAt: 1,
    deadlineAt: 2,
    payload: {
      toolCallId: 'call-2',
      toolName: 'session.run_command' as const,
      command: 'sudo passwd root',
      timeoutMs: 300_000,
    },
  };

  assert.equal(getHumanGatePrimaryActionLabel(gate), '继续等待');
  assert.equal(getHumanGateSecondaryActionLabel(gate), null);
  assert.equal(getHumanGateTitle(gate), '终端交互已暂停');
  assert.equal(
    getHumanGateDescription(gate),
    'Agent 已暂停等待。你可以先在终端中完成输入，再回到这里继续等待。'
  );
});

void test('open terminal_input gates do not expose action buttons', () => {
  const gate = {
    id: 'gate-3',
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'terminal_input' as const,
    status: 'open' as const,
    reason: '命令正在等待你在终端中继续输入。',
    openedAt: 1,
    deadlineAt: 2,
    payload: {
      toolCallId: 'call-3',
      toolName: 'session.run_command' as const,
      command: 'sudo passwd root',
      timeoutMs: 300_000,
    },
  };

  assert.equal(getHumanGatePrimaryActionLabel(gate), null);
  assert.equal(getHumanGateSecondaryActionLabel(gate), null);
  assert.equal(getHumanGateTitle(gate), '等待终端输入');
  assert.equal(getHumanGateDescription(gate), '请在对应终端中完成交互输入。');
});

void test('maps terminal_input gates into session locks and banner copy', () => {
  const gate = {
    id: 'gate-3',
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'terminal_input' as const,
    status: 'open' as const,
    reason: '命令正在等待你在终端中继续输入。',
    openedAt: 1,
    deadlineAt: 2,
    payload: {
      toolCallId: 'call-3',
      toolName: 'session.run_command' as const,
      command: 'sudo passwd root',
      timeoutMs: 300_000,
    },
  };

  const lock = getAgentSessionLock(gate);
  assert.deepEqual(lock, {
    sessionId: 'session-1',
    runId: 'run-1',
    gateId: 'gate-3',
    status: 'open',
    reason: '命令正在等待你在终端中继续输入。',
    command: 'sudo passwd root',
  });
  assert.equal(
    getAgentSessionLockBannerText(lock!),
    '该终端正在被 Agent 用于交互命令，请在此完成输入。'
  );
});
