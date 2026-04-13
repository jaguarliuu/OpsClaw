import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOpenSftpViewState,
  closeSftpView,
  type WorkbenchPrimaryViewState,
} from './workbenchPrimaryViewModel.js';

void test('buildOpenSftpViewState switches current node to sftp without mutating session selection', () => {
  const current: WorkbenchPrimaryViewState = {
    mode: 'terminal',
    nodeId: 'node-1',
    sessionId: 'session-1',
  };

  assert.deepEqual(
    buildOpenSftpViewState(current, {
      nodeId: 'node-2',
    }),
    {
      mode: 'sftp',
      nodeId: 'node-2',
      sessionId: 'session-1',
    }
  );
});

void test('buildOpenSftpViewState accepts an explicit session id override', () => {
  assert.deepEqual(
    buildOpenSftpViewState(
      {
        mode: 'terminal',
        nodeId: 'node-1',
        sessionId: 'session-1',
      },
      {
        nodeId: 'node-2',
        sessionId: 'session-2',
      }
    ),
    {
      mode: 'sftp',
      nodeId: 'node-2',
      sessionId: 'session-2',
    }
  );
});

void test('closeSftpView falls back to terminal for the last active session node', () => {
  assert.deepEqual(
    closeSftpView({
      mode: 'sftp',
      nodeId: 'node-1',
      sessionId: 'session-1',
    }),
    {
      mode: 'terminal',
      nodeId: 'node-1',
      sessionId: 'session-1',
    }
  );
});
