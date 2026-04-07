import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

void test('parameter_confirmation gates expose confirm and reject actions with dedicated copy', () => {
  const gate = {
    id: 'gate-4',
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'parameter_confirmation' as const,
    status: 'open' as const,
    reason: '该操作依赖受保护参数，请确认参数后继续。',
    openedAt: 1,
    deadlineAt: 2,
    payload: {
      toolCallId: 'call-4',
      toolName: 'session.run_command' as const,
      command: 'sudo adduser ops-admin',
      intentKind: 'user_management' as const,
      fields: [
        {
          name: 'username',
          label: '用户名',
          value: '',
          required: true,
          source: 'agent_inferred' as const,
        },
      ],
    },
  };

  assert.equal(getHumanGatePrimaryActionLabel(gate), '确认参数');
  assert.equal(getHumanGateSecondaryActionLabel(gate), '拒绝');
  assert.equal(getHumanGateTitle(gate), '等待参数确认');
  assert.equal(getHumanGateDescription(gate), '请确认或补全关键参数，确认后才会继续执行命令。');
});
