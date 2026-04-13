import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRestoreSshTerminalViewport } from './sshTerminalPaneVisibilityModel';

void test('restores viewport when pane becomes visible again and remains active', () => {
  assert.equal(
    shouldRestoreSshTerminalViewport({
      active: true,
      visible: true,
      wasVisible: false,
    }),
    true
  );
});

void test('does not restore viewport when pane was already visible', () => {
  assert.equal(
    shouldRestoreSshTerminalViewport({
      active: true,
      visible: true,
      wasVisible: true,
    }),
    false
  );
});

void test('does not restore viewport for inactive pane even if visibility changes', () => {
  assert.equal(
    shouldRestoreSshTerminalViewport({
      active: false,
      visible: true,
      wasVisible: false,
    }),
    false
  );
});
