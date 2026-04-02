import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canSendSshTerminalCommand,
  getSshTerminalExecuteCommandError,
  normalizeSshTerminalCommand,
} from './sshTerminalControllerModel.js';

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;
const SOCKET_CLOSED = 3;

void test('normalizeSshTerminalCommand trims surrounding whitespace', () => {
  assert.equal(normalizeSshTerminalCommand('  ls -la  '), 'ls -la');
});

void test('canSendSshTerminalCommand requires a non-empty command and an open websocket', () => {
  assert.equal(canSendSshTerminalCommand('', SOCKET_OPEN), false);
  assert.equal(canSendSshTerminalCommand('pwd', SOCKET_CONNECTING), false);
  assert.equal(canSendSshTerminalCommand('pwd', SOCKET_OPEN), true);
});

void test('getSshTerminalExecuteCommandError rejects empty commands first', () => {
  assert.equal(
    getSshTerminalExecuteCommandError({
      hasPendingExecution: false,
      normalizedCommand: '',
      websocketReadyState: SOCKET_OPEN,
    }),
    '命令不能为空。'
  );
});

void test('getSshTerminalExecuteCommandError rejects concurrent agent executions', () => {
  assert.equal(
    getSshTerminalExecuteCommandError({
      hasPendingExecution: true,
      normalizedCommand: 'pwd',
      websocketReadyState: SOCKET_OPEN,
    }),
    '当前会话已有命令正在由 Agent 执行。'
  );
});

void test('getSshTerminalExecuteCommandError rejects disconnected sessions and otherwise returns null', () => {
  assert.equal(
    getSshTerminalExecuteCommandError({
      hasPendingExecution: false,
      normalizedCommand: 'pwd',
      websocketReadyState: SOCKET_CLOSED,
    }),
    '当前会话未连接，无法执行命令。'
  );

  assert.equal(
    getSshTerminalExecuteCommandError({
      hasPendingExecution: false,
      normalizedCommand: 'pwd',
      websocketReadyState: SOCKET_OPEN,
    }),
    null
  );
});
