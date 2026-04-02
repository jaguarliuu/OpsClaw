import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionRegistry } from './sessionRegistry.js';

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

test('命令等待人工输入时会延长等待并在完成后返回后续输出', async () => {
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

  const execution = registry.executeCommand('session-1', 'python interactive.py', {
    timeoutMs: 20,
    humanInputTimeoutMs: 120,
  } as never);

  await waitForMicrotask();

  const markers = extractMarkers(sentPayloads[0] ?? '');
  registry.appendTerminalData('session-1', `\n${markers.startMarker}\nPassword: `);
  (registry as never as { noteUserInput: (sessionId: string, payload: string) => void }).noteUserInput(
    'session-1',
    'secret'
  );
  (registry as never as { noteUserInput: (sessionId: string, payload: string) => void }).noteUserInput(
    'session-1',
    '\n'
  );

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
