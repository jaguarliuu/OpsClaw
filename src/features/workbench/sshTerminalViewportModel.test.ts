import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSshTerminalResizeMessage,
  shouldSendSshTerminalResize,
} from './sshTerminalViewportModel.js';

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;

void test('shouldSendSshTerminalResize requires an open websocket', () => {
  assert.equal(
    shouldSendSshTerminalResize({
      lastSize: null,
      nextSize: { cols: 120, rows: 40 },
      websocketReadyState: SOCKET_CONNECTING,
    }),
    false
  );

  assert.equal(
    shouldSendSshTerminalResize({
      lastSize: null,
      nextSize: { cols: 120, rows: 40 },
      websocketReadyState: SOCKET_OPEN,
    }),
    true
  );
});

void test('shouldSendSshTerminalResize skips duplicate viewport sizes', () => {
  assert.equal(
    shouldSendSshTerminalResize({
      lastSize: { cols: 120, rows: 40 },
      nextSize: { cols: 120, rows: 40 },
      websocketReadyState: SOCKET_OPEN,
    }),
    false
  );

  assert.equal(
    shouldSendSshTerminalResize({
      lastSize: { cols: 120, rows: 40 },
      nextSize: { cols: 132, rows: 43 },
      websocketReadyState: SOCKET_OPEN,
    }),
    true
  );
});

void test('buildSshTerminalResizeMessage preserves the expected websocket payload shape', () => {
  assert.deepEqual(buildSshTerminalResizeMessage({ cols: 132, rows: 43 }), {
    type: 'resize',
    payload: {
      cols: 132,
      rows: 43,
    },
  });
});
