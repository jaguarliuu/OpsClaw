import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSshTerminalContextMenuItems,
  closeSshTerminalContextMenuState,
  openSshTerminalContextMenuState,
  shouldCloseSshTerminalContextMenuOnKeyDown,
  shouldCloseSshTerminalContextMenuOnPointerDown,
} from './sshTerminalContextMenuModel.js';

void test('openSshTerminalContextMenuState stores the menu position and copy availability', () => {
  assert.deepEqual(
    openSshTerminalContextMenuState(
      { x: 48, y: 72 },
      { canCopySelection: true }
    ),
    {
      canCopySelection: true,
      x: 48,
      y: 72,
    }
  );
});

void test('buildSshTerminalContextMenuItems disables copy when the terminal has no selection', () => {
  assert.deepEqual(
    buildSshTerminalContextMenuItems({
      canCopySelection: false,
    }),
    [
      { action: 'copy-selection', disabled: true, label: '复制', tone: 'disabled' },
      { action: 'paste-from-clipboard', disabled: false, label: '粘贴', tone: 'default' },
      { action: 'select-all', disabled: false, label: '全选', tone: 'default' },
    ]
  );
});

void test('buildSshTerminalContextMenuItems marks active actions with the default visual tone', () => {
  assert.deepEqual(
    buildSshTerminalContextMenuItems({
      canCopySelection: true,
    }),
    [
      { action: 'copy-selection', disabled: false, label: '复制', tone: 'default' },
      { action: 'paste-from-clipboard', disabled: false, label: '粘贴', tone: 'default' },
      { action: 'select-all', disabled: false, label: '全选', tone: 'default' },
    ]
  );
});

void test('close and dismissal helpers match the existing context-menu behavior', () => {
  assert.equal(closeSshTerminalContextMenuState(), null);
  assert.equal(shouldCloseSshTerminalContextMenuOnPointerDown(true), false);
  assert.equal(shouldCloseSshTerminalContextMenuOnPointerDown(false), true);
  assert.equal(shouldCloseSshTerminalContextMenuOnKeyDown('Escape'), true);
  assert.equal(shouldCloseSshTerminalContextMenuOnKeyDown('Enter'), false);
});
