import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentSessionModel,
  getAgentSessionLockBannerText,
  getSessionAgentSessionLock,
} from './agentSessionModel.js';

void test('terminal input gates produce a session lock and block new agent work', () => {
  const model = createAgentSessionModel({
    activeGate: {
      id: 'gate-1',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'terminal_input',
      status: 'open',
      reason: '命令正在等待你在终端中继续输入。',
      openedAt: 1,
      deadlineAt: 2,
      payload: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        command: 'sudo passwd root',
        timeoutMs: 300_000,
      },
    },
    pendingContinuationRunId: null,
  });

  assert.equal(model.isInteractionLocked, true);
  assert.equal(model.canStartAgentRun, false);
  assert.equal(model.canClearAgentItems, false);
  assert.deepEqual(model.sessionLock, {
    sessionId: 'session-1',
    runId: 'run-1',
    gateId: 'gate-1',
    status: 'open',
    reason: '命令正在等待你在终端中继续输入。',
    command: 'sudo passwd root',
  });
  assert.deepEqual(getSessionAgentSessionLock(model, 'session-1'), model.sessionLock);
  assert.equal(getSessionAgentSessionLock(model, 'session-2'), null);
  assert.equal(
    getAgentSessionLockBannerText(model.sessionLock!),
    '该终端正在被 Agent 用于交互命令，请在此完成输入。'
  );
});

void test('approval gates block panel actions without locking a terminal session', () => {
  const model = createAgentSessionModel({
    activeGate: {
      id: 'gate-2',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'approval',
      status: 'open',
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
          action: 'require_approval',
          matches: [],
        },
      },
    },
    pendingContinuationRunId: null,
  });

  assert.equal(model.isInteractionLocked, true);
  assert.equal(model.canStartAgentRun, false);
  assert.equal(model.canClearAgentItems, false);
  assert.equal(model.sessionLock, null);
});

void test('pending continuation without an open gate still blocks panel actions', () => {
  const model = createAgentSessionModel({
    activeGate: null,
    pendingContinuationRunId: 'run-1',
  });

  assert.equal(model.isInteractionLocked, true);
  assert.equal(model.canStartAgentRun, false);
  assert.equal(model.canClearAgentItems, false);
  assert.equal(model.sessionLock, null);
});

void test('idle state allows new agent work and clears session locks', () => {
  const model = createAgentSessionModel({
    activeGate: null,
    pendingContinuationRunId: null,
  });

  assert.equal(model.isInteractionLocked, false);
  assert.equal(model.canStartAgentRun, true);
  assert.equal(model.canClearAgentItems, true);
  assert.equal(model.sessionLock, null);
});

void test('expired terminal input gates keep the session lock banner resumable', () => {
  const model = createAgentSessionModel({
    activeGate: {
      id: 'gate-3',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'terminal_input',
      status: 'expired',
      reason: '命令等待人工输入超时，Agent 已停止等待结果。',
      openedAt: 1,
      deadlineAt: 2,
      payload: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        command: 'sudo passwd root',
        timeoutMs: 300_000,
      },
    },
    pendingContinuationRunId: 'run-1',
  });

  assert.equal(
    getAgentSessionLockBannerText(model.sessionLock!),
    '该终端上的 Agent 交互等待已暂停，可在 AI 面板中继续等待。'
  );
});
