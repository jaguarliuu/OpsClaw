import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentSessionModel,
  getAgentSessionLockBannerText,
  getSessionAgentSessionLock,
  isAgentSessionLocked,
} from './agentSessionModel.js';

void test('terminal_wait interaction produces a session lock and blocks new agent work', () => {
  const model = createAgentSessionModel({
    activeInteraction: {
      id: 'interaction-1',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'open',
      interactionKind: 'terminal_wait',
      riskLevel: 'medium',
      blockingMode: 'hard_block',
      title: '等待终端交互',
      message: '命令正在等待你在终端中继续输入。',
      schemaVersion: 'v1',
      fields: [],
      actions: [],
      openedAt: 1,
      deadlineAt: null,
      metadata: {
        commandPreview: 'sudo passwd root',
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
    gateId: 'interaction-1',
    status: 'open',
    reason: '命令正在等待你在终端中继续输入。',
    command: 'sudo passwd root',
  });
  assert.equal(getSessionAgentSessionLock(model, 'session-1')?.runId, 'run-1');
});

void test('non-terminal interactions block panel actions without locking a terminal session', () => {
  const model = createAgentSessionModel({
    activeInteraction: {
      id: 'interaction-1',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'open',
      interactionKind: 'approval',
      riskLevel: 'high',
      blockingMode: 'hard_block',
      title: '操作审批',
      message: '该操作需要用户批准后继续执行。',
      schemaVersion: 'v1',
      fields: [],
      actions: [],
      openedAt: 1,
      deadlineAt: null,
      metadata: {},
    },
    pendingContinuationRunId: null,
  });

  assert.equal(model.isInteractionLocked, true);
  assert.equal(model.sessionLock, null);
  assert.equal(isAgentSessionLocked(model.sessionLock), false);
});

void test('pending continuation without an open interaction still blocks panel actions', () => {
  const model = createAgentSessionModel({
    activeInteraction: null,
    pendingContinuationRunId: 'run-1',
  });

  assert.equal(model.hasPendingContinuation, true);
  assert.equal(model.isInteractionLocked, true);
  assert.equal(model.canStartAgentRun, false);
});

void test('idle state allows new agent work and clears session locks', () => {
  const model = createAgentSessionModel({
    activeInteraction: null,
    pendingContinuationRunId: null,
  });

  assert.equal(model.isInteractionLocked, false);
  assert.equal(model.canStartAgentRun, true);
  assert.equal(model.canClearAgentItems, true);
  assert.equal(model.sessionLock, null);
});

void test('expired terminal_wait interactions keep the session lock banner resumable', () => {
  const model = createAgentSessionModel({
    activeInteraction: {
      id: 'interaction-1',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'expired',
      interactionKind: 'terminal_wait',
      riskLevel: 'medium',
      blockingMode: 'hard_block',
      title: '等待终端交互',
      message: '命令等待人工输入超时，Agent 已停止等待结果。',
      schemaVersion: 'v1',
      fields: [],
      actions: [],
      openedAt: 1,
      deadlineAt: null,
      metadata: {
        commandPreview: 'sudo passwd root',
      },
    },
    pendingContinuationRunId: null,
  });

  assert.equal(
    getAgentSessionLockBannerText(model.sessionLock as NonNullable<typeof model.sessionLock>),
    '该终端上的 Agent 交互等待已暂停，可在 AI 面板中继续等待。'
  );
});
