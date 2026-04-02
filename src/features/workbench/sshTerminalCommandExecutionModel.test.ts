import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendTerminalTranscript,
  buildExecuteCommandPayload,
  consumePendingExecutionBuffer,
  createPendingExecutionCaptureState,
  createTerminalCommandMarkers,
} from './sshTerminalCommandExecutionModel.js';

void test('createTerminalCommandMarkers builds paired start and end markers for a marker id', () => {
  assert.deepEqual(createTerminalCommandMarkers('abc123'), {
    endMarkerPrefix: '__OPSCLAW_CMD_END_abc123__:',
    startMarker: '__OPSCLAW_CMD_START_abc123__',
  });
});

void test('buildExecuteCommandPayload wraps a command with start and end markers', () => {
  assert.equal(
    buildExecuteCommandPayload('pwd', {
      startMarker: '__OPSCLAW_CMD_START_abc123__',
      endMarkerPrefix: '__OPSCLAW_CMD_END_abc123__:',
    }),
    "printf '\\n__OPSCLAW_CMD_START_abc123__\\n'\n" +
      'pwd\n' +
      "__opsclaw_agent_status=$?\n" +
      "printf '\\n__OPSCLAW_CMD_END_abc123__:%s\\n' \"$__opsclaw_agent_status\"\n"
  );
});

void test('appendTerminalTranscript keeps only the tail when the transcript exceeds the max length', () => {
  assert.equal(appendTerminalTranscript('abc', 'def', 5), 'bcdef');
});

void test('consumePendingExecutionBuffer waits for the start marker before capturing output', () => {
  const pendingExecution = createPendingExecutionCaptureState(
    'pwd',
    100,
    {
      startMarker: '__OPSCLAW_CMD_START_abc123__',
      endMarkerPrefix: '__OPSCLAW_CMD_END_abc123__:',
    }
  );

  const firstChunk = consumePendingExecutionBuffer(pendingExecution, 'noise only', 120);

  assert.equal(firstChunk.result, null);
  if (firstChunk.pendingExecution === null) {
    throw new Error('pendingExecution should still exist before the start marker arrives');
  }
  assert.equal(firstChunk.pendingExecution.captureStarted, false);
  assert.equal(
    firstChunk.pendingExecution.buffer,
    'noise only'.slice(-pendingExecution.startMarker.length)
  );
});

void test('consumePendingExecutionBuffer resolves a completed execution result once the end marker is complete', () => {
  const pendingExecution = createPendingExecutionCaptureState(
    'pwd',
    100,
    {
      startMarker: '__OPSCLAW_CMD_START_abc123__',
      endMarkerPrefix: '__OPSCLAW_CMD_END_abc123__:',
    }
  );

  const result = consumePendingExecutionBuffer(
    pendingExecution,
    'noise\n__OPSCLAW_CMD_START_abc123__\n/workdir\r\n__OPSCLAW_CMD_END_abc123__:0\n',
    145
  );

  assert.equal(result.pendingExecution, null);
  assert.deepEqual(result.result, {
    command: 'pwd',
    completedAt: 145,
    durationMs: 45,
    exitCode: 0,
    output: '/workdir',
    startedAt: 100,
  });
});

void test('consumePendingExecutionBuffer strips ansi codes before reading the end marker exit code', () => {
  const pendingExecution = createPendingExecutionCaptureState(
    'echo ok',
    200,
    {
      startMarker: '__OPSCLAW_CMD_START_ansi__',
      endMarkerPrefix: '__OPSCLAW_CMD_END_ansi__:',
    }
  );

  const result = consumePendingExecutionBuffer(
    pendingExecution,
    '__OPSCLAW_CMD_START_ansi__\nhello\r\n__OPSCLAW_CMD_END_ansi__:\u001b[32m7\u001b[0m\n',
    260
  );

  assert.equal(result.pendingExecution, null);
  assert.equal(result.result?.exitCode, 7);
  assert.equal(result.result?.output, 'hello');
});
