import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionRegistry } from './sessionRegistry.js';

type SessionRegistryInternals = SessionRegistry & {
  getPendingExecutionDebug: (
    sessionId: string
  ) =>
    | {
        state: string;
        command: string;
        startMarker: string;
      }
    | null;
  noteUserInput: (sessionId: string, payload: string) => void;
  resumePendingExecutionWait: (sessionId: string, timeoutMs: number) => void;
  cancelPendingExecutionWait: (sessionId: string) => void;
};

function waitForMicrotask() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function waitFor(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractMarkers(payload: string) {
  const startMarkerMatch = payload.match(/__OPSCLAW_CMD_START_[a-f0-9]+__/);
  const endMarkerPrefixMatch = payload.match(/__OPSCLAW_CMD_END_[a-f0-9]+__:/);

  assert.notEqual(startMarkerMatch, null);
  assert.notEqual(endMarkerPrefixMatch, null);

  return {
    startMarker: startMarkerMatch![0],
    endMarkerPrefix: endMarkerPrefixMatch![0],
  };
}

function getRegistryInternals(registry: SessionRegistry): SessionRegistryInternals {
  return registry as SessionRegistryInternals;
}

test('中断执行中的命令后会释放会话锁并允许再次执行', async () => {
  const registry = new SessionRegistry();
  const sentPayloads: string[] = [];

  registry.registerSession({
    sessionId: 'session-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    sendInput(payload) {
      sentPayloads.push(payload);
    },
  });
  registry.updateSessionStatus('session-1', 'connected');

  const firstAbortController = new AbortController();
  const firstExecution = registry.executeCommand('session-1', 'sleep 30', {
    timeoutMs: 5_000,
    signal: firstAbortController.signal,
  } as never);

  await waitForMicrotask();
  firstAbortController.abort();

  await assert.rejects(firstExecution, /已停止|已取消/);
  assert.equal(sentPayloads.some((payload) => payload === '\u0003'), true);

  const secondAbortController = new AbortController();
  const secondExecution = registry.executeCommand('session-1', 'echo ok', {
    timeoutMs: 5_000,
    signal: secondAbortController.signal,
  } as never);

  await waitForMicrotask();
  assert.equal(sentPayloads.some((payload) => payload.includes('echo ok')), true);

  secondAbortController.abort();
  await assert.rejects(secondExecution, (error: unknown) => {
    assert.equal(error instanceof Error, true);
    assert.doesNotMatch((error as Error).message, /已有命令正在由 Agent 执行/);
    return true;
  });
});

test('交互命令会以单行 payload 发送，避免结束 marker 残留为后续 tty 输入', async () => {
  const registry = new SessionRegistry();
  const sentPayloads: string[] = [];

  registry.registerSession({
    sessionId: 'session-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    sendInput(payload) {
      sentPayloads.push(payload);
    },
  });
  registry.updateSessionStatus('session-1', 'connected');

  const execution = registry.executeCommand('session-1', 'sudo adduser adminuser', {
    timeoutMs: 200,
  } as never);

  await waitForMicrotask();

  const payload = sentPayloads[0] ?? '';
  assert.equal(payload.includes('sudo adduser adminuser\nprintf'), false);
  assert.match(
    payload,
    /printf '\\n__OPSCLAW_CMD_START_[a-f0-9]+__\\n'; sudo adduser adminuser; printf '\\n__OPSCLAW_CMD_END_[a-f0-9]+__:%s\\n' "\$\?"\n/
  );

  const markers = extractMarkers(payload);
  registry.appendTerminalData(
    'session-1',
    `\n${markers.startMarker}\nAdding user...\r\n${markers.endMarkerPrefix}0\r\n`
  );

  await execution;
});

test('交互命令的人类输入超时会挂起等待而不是永久拒绝', async () => {
  const registry = new SessionRegistry();
  const internals = getRegistryInternals(registry);
  const sentPayloads: string[] = [];

  registry.registerSession({
    sessionId: 'session-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    sendInput(payload) {
      sentPayloads.push(payload);
    },
  });
  registry.updateSessionStatus('session-1', 'connected');

  let settled = false;
  const execution = registry
    .executeCommand('session-1', 'python interactive.py', {
      timeoutMs: 200,
      humanInputTimeoutMs: 30,
    } as never)
    .finally(() => {
      settled = true;
    });

  await waitForMicrotask();

  const markers = extractMarkers(sentPayloads[0] ?? '');
  registry.appendTerminalData('session-1', `\n${markers.startMarker}\nPassword: `);
  internals.noteUserInput('session-1', 'secret');
  internals.noteUserInput('session-1', '\n');

  assert.deepEqual(internals.getPendingExecutionDebug('session-1'), {
    state: 'awaiting_human_input',
    command: 'python interactive.py',
    startMarker: markers.startMarker,
  });

  await waitFor(60);

  assert.equal(settled, false);
  assert.deepEqual(internals.getPendingExecutionDebug('session-1'), {
    state: 'suspended_waiting_for_input',
    command: 'python interactive.py',
    startMarker: markers.startMarker,
  });

  registry.appendTerminalData(
    'session-1',
    `Logged in\r\n${markers.endMarkerPrefix}0\r\n`
  );

  const result = await execution;

  assert.match(result.output, /Password:/);
  assert.match(result.output, /Logged in/);
  assert.equal(internals.getPendingExecutionDebug('session-1'), null);
});

test('resumePendingExecutionWait 会重新挂起等待并允许命令稍后完成', async () => {
  const registry = new SessionRegistry();
  const internals = getRegistryInternals(registry);
  const sentPayloads: string[] = [];

  registry.registerSession({
    sessionId: 'session-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    sendInput(payload) {
      sentPayloads.push(payload);
    },
  });
  registry.updateSessionStatus('session-1', 'connected');

  const execution = registry.executeCommand('session-1', 'python interactive.py', {
    timeoutMs: 200,
    humanInputTimeoutMs: 30,
  } as never);

  await waitForMicrotask();

  const markers = extractMarkers(sentPayloads[0] ?? '');
  registry.appendTerminalData('session-1', `\n${markers.startMarker}\nPassword: `);
  internals.noteUserInput('session-1', 'secret');
  internals.noteUserInput('session-1', '\n');

  await waitFor(60);

  assert.deepEqual(internals.getPendingExecutionDebug('session-1'), {
    state: 'suspended_waiting_for_input',
    command: 'python interactive.py',
    startMarker: markers.startMarker,
  });

  internals.resumePendingExecutionWait('session-1', 50);
  assert.deepEqual(internals.getPendingExecutionDebug('session-1'), {
    state: 'awaiting_human_input',
    command: 'python interactive.py',
    startMarker: markers.startMarker,
  });

  await waitFor(20);

  assert.deepEqual(internals.getPendingExecutionDebug('session-1'), {
    state: 'awaiting_human_input',
    command: 'python interactive.py',
    startMarker: markers.startMarker,
  });

  registry.appendTerminalData(
    'session-1',
    `Logged in\r\n${markers.endMarkerPrefix}0\r\n`
  );

  const result = await execution;

  assert.match(result.output, /Logged in/);
  assert.equal(internals.getPendingExecutionDebug('session-1'), null);
});

test('cancelPendingExecutionWait 会中断挂起中的交互命令并拒绝原 promise', async () => {
  const registry = new SessionRegistry();
  const internals = getRegistryInternals(registry);
  const sentPayloads: string[] = [];

  registry.registerSession({
    sessionId: 'session-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    sendInput(payload) {
      sentPayloads.push(payload);
    },
  });
  registry.updateSessionStatus('session-1', 'connected');

  const execution = registry.executeCommand('session-1', 'python interactive.py', {
    timeoutMs: 200,
    humanInputTimeoutMs: 30,
  } as never);

  await waitForMicrotask();

  const markers = extractMarkers(sentPayloads[0] ?? '');
  registry.appendTerminalData('session-1', `\n${markers.startMarker}\nPassword: `);
  internals.noteUserInput('session-1', 'secret');
  internals.noteUserInput('session-1', '\n');

  await waitFor(60);

  assert.equal(
    internals.getPendingExecutionDebug('session-1')?.state,
    'suspended_waiting_for_input'
  );

  internals.cancelPendingExecutionWait('session-1');

  await assert.rejects(execution, /用户取消了等待中的交互命令/);
  assert.equal(sentPayloads.includes('\u0003'), true);
  assert.equal(internals.getPendingExecutionDebug('session-1'), null);
});

test('挂起中的交互命令在会话断开时仍会清理并拒绝原 promise', async () => {
  const registry = new SessionRegistry();
  const internals = getRegistryInternals(registry);
  const sentPayloads: string[] = [];

  registry.registerSession({
    sessionId: 'session-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    sendInput(payload) {
      sentPayloads.push(payload);
    },
  });
  registry.updateSessionStatus('session-1', 'connected');

  const execution = registry.executeCommand('session-1', 'python interactive.py', {
    timeoutMs: 200,
    humanInputTimeoutMs: 30,
  } as never);

  await waitForMicrotask();

  const markers = extractMarkers(sentPayloads[0] ?? '');
  registry.appendTerminalData('session-1', `\n${markers.startMarker}\nPassword: `);
  internals.noteUserInput('session-1', 'secret');
  internals.noteUserInput('session-1', '\n');

  await waitFor(60);

  assert.equal(internals.getPendingExecutionDebug('session-1')?.state, 'suspended_waiting_for_input');

  registry.updateSessionStatus('session-1', 'closed', '连接已关闭');

  await assert.rejects(execution, /连接已关闭/);
  assert.equal(internals.getPendingExecutionDebug('session-1'), null);
});

test('恢复后的交互命令再次超时后会重新进入挂起状态', async () => {
  const registry = new SessionRegistry();
  const internals = getRegistryInternals(registry);
  const sentPayloads: string[] = [];

  registry.registerSession({
    sessionId: 'session-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    sendInput(payload) {
      sentPayloads.push(payload);
    },
  });
  registry.updateSessionStatus('session-1', 'connected');

  const execution = registry.executeCommand('session-1', 'python interactive.py', {
    timeoutMs: 200,
    humanInputTimeoutMs: 30,
  } as never);

  await waitForMicrotask();

  const markers = extractMarkers(sentPayloads[0] ?? '');
  registry.appendTerminalData('session-1', `\n${markers.startMarker}\nPassword: `);
  internals.noteUserInput('session-1', 'secret');
  internals.noteUserInput('session-1', '\n');

  await waitFor(60);
  assert.equal(internals.getPendingExecutionDebug('session-1')?.state, 'suspended_waiting_for_input');

  internals.resumePendingExecutionWait('session-1', 30);
  await waitFor(60);

  assert.equal(internals.getPendingExecutionDebug('session-1')?.state, 'suspended_waiting_for_input');

  registry.unregisterSession('session-1', 'cleanup');
  await assert.rejects(execution, /cleanup/);
});

test('交互命令会继续隐藏人工输入内容', async () => {
  const registry = new SessionRegistry();
  const internals = getRegistryInternals(registry);
  const sentPayloads: string[] = [];

  registry.registerSession({
    sessionId: 'session-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    sendInput(payload) {
      sentPayloads.push(payload);
    },
  });
  registry.updateSessionStatus('session-1', 'connected');

  const execution = registry.executeCommand('session-1', 'python interactive.py', {
    timeoutMs: 20,
    humanInputTimeoutMs: 120,
  } as never);

  await waitForMicrotask();

  const markers = extractMarkers(sentPayloads[0] ?? '');
  registry.appendTerminalData('session-1', `\n${markers.startMarker}\nPassword: `);
  internals.noteUserInput('session-1', 'secret');
  internals.noteUserInput('session-1', '\n');

  await waitFor(40);

  registry.appendTerminalData(
    'session-1',
    `secret\r\nLogged in\r\n${markers.endMarkerPrefix}0\r\n`
  );

  const result = await execution;

  assert.match(result.output, /Password:/);
  assert.match(result.output, /Logged in/);
  assert.doesNotMatch(result.output, /secret/);
});
