import assert from 'node:assert/strict';
import test from 'node:test';

import type { LiveSession } from './types.js';
import {
  buildTerminalConnectMessage,
  buildTerminalConnectingNotice,
  buildTerminalReconnectNotice,
  getTerminalReconnectDelayMs,
  shouldOpenSshTerminalConnection,
  shouldReconnectTerminalSession,
  shouldReportTerminalSocketError,
} from './sshTerminalConnectionModel.js';

const session: LiveSession = {
  id: 'session-1',
  nodeId: 'node-1',
  label: 'alpha',
  host: '10.0.0.1',
  port: 22,
  username: 'root',
  authMode: 'password',
  password: 'secret',
  privateKey: undefined,
  passphrase: undefined,
  status: 'connecting',
};

void test('buildTerminalConnectMessage includes session credentials and terminal geometry', () => {
  assert.deepEqual(buildTerminalConnectMessage(session, { cols: 120, rows: 40 }), {
    type: 'connect',
    payload: {
      cols: 120,
      rows: 40,
      host: '10.0.0.1',
      nodeId: 'node-1',
      passphrase: undefined,
      password: 'secret',
      port: 22,
      privateKey: undefined,
      sessionId: 'session-1',
      username: 'root',
    },
  });
});

void test('shouldReconnectTerminalSession retries only after a previously connected unintentional close below max attempts', () => {
  assert.equal(
    shouldReconnectTerminalSession({
      attempt: 1,
      everConnected: true,
      intentionalClose: false,
      maxReconnectAttempts: 5,
    }),
    true
  );
  assert.equal(
    shouldReconnectTerminalSession({
      attempt: 5,
      everConnected: true,
      intentionalClose: false,
      maxReconnectAttempts: 5,
    }),
    false
  );
  assert.equal(
    shouldReconnectTerminalSession({
      attempt: 0,
      everConnected: false,
      intentionalClose: false,
      maxReconnectAttempts: 5,
    }),
    false
  );
  assert.equal(
    shouldReconnectTerminalSession({
      attempt: 0,
      everConnected: true,
      intentionalClose: true,
      maxReconnectAttempts: 5,
    }),
    false
  );
});

void test('getTerminalReconnectDelayMs uses configured delays with a fallback', () => {
  assert.equal(getTerminalReconnectDelayMs([1000, 2000], 1), 2000);
  assert.equal(getTerminalReconnectDelayMs([1000, 2000], 3), 30000);
});

void test('buildTerminalConnectingNotice and buildTerminalReconnectNotice return the terminal copy', () => {
  assert.equal(buildTerminalConnectingNotice(session), 'Connecting to root@10.0.0.1:22 ...');
  assert.equal(
    buildTerminalReconnectNotice({
      attempt: 2,
      delayMs: 4000,
      maxReconnectAttempts: 5,
    }),
    '\r\n\x1b[33m[断开] 4s 后自动重连... (3/5)\x1b[0m'
  );
});

void test('shouldReportTerminalSocketError reports only before the first successful connection', () => {
  assert.equal(shouldReportTerminalSocketError(false), true);
  assert.equal(shouldReportTerminalSocketError(true), false);
});

void test('shouldOpenSshTerminalConnection waits until the terminal runtime is ready', () => {
  assert.equal(
    shouldOpenSshTerminalConnection({
      hasTerminal: false,
      isRuntimeReady: false,
    }),
    false
  );
  assert.equal(
    shouldOpenSshTerminalConnection({
      hasTerminal: true,
      isRuntimeReady: false,
    }),
    false
  );
  assert.equal(
    shouldOpenSshTerminalConnection({
      hasTerminal: false,
      isRuntimeReady: true,
    }),
    false
  );
  assert.equal(
    shouldOpenSshTerminalConnection({
      hasTerminal: true,
      isRuntimeReady: true,
    }),
    true
  );
});
