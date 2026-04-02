import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  SavedConnectionGroup,
  SavedConnectionProfile,
} from './types.js';
import {
  closeSessionTreeContextMenuState,
  openSessionTreeGroupContextMenuState,
  openSessionTreeProfileContextMenuState,
  openSessionTreeRootContextMenuState,
  shouldCloseSessionTreeContextMenuOnKeyDown,
  shouldCloseSessionTreeContextMenuOnPointerDown,
} from './sessionTreeContextMenuModel.js';

const baseProfile: SavedConnectionProfile = {
  id: 'node-1',
  name: 'alpha',
  host: '10.0.0.1',
  port: 22,
  username: 'root',
  authMode: 'password',
  groupId: 'group-1',
  group: 'Default',
  jumpHostId: null,
  note: '',
};

const baseGroup: SavedConnectionGroup = {
  id: 'group-1',
  name: 'Default',
  isDefault: true,
  profiles: [baseProfile],
};

void test('openSessionTreeRootContextMenuState creates a root menu state at the given position', () => {
  assert.deepEqual(openSessionTreeRootContextMenuState({ x: 16, y: 24 }), {
    type: 'root',
    x: 16,
    y: 24,
  });
});

void test('openSessionTreeGroupContextMenuState creates a group menu state at the given position', () => {
  assert.deepEqual(openSessionTreeGroupContextMenuState(baseGroup, { x: 20, y: 28 }), {
    type: 'group',
    group: baseGroup,
    x: 20,
    y: 28,
  });
});

void test('openSessionTreeProfileContextMenuState creates a profile menu state at the given position', () => {
  assert.deepEqual(openSessionTreeProfileContextMenuState(baseProfile, { x: 32, y: 44 }), {
    type: 'profile',
    profile: baseProfile,
    x: 32,
    y: 44,
  });
});

void test('closeSessionTreeContextMenuState always clears the menu state', () => {
  assert.equal(closeSessionTreeContextMenuState(), null);
});

void test('shouldCloseSessionTreeContextMenuOnPointerDown closes only when clicking outside the menu', () => {
  assert.equal(shouldCloseSessionTreeContextMenuOnPointerDown(true), false);
  assert.equal(shouldCloseSessionTreeContextMenuOnPointerDown(false), true);
});

void test('shouldCloseSessionTreeContextMenuOnKeyDown closes only on Escape', () => {
  assert.equal(shouldCloseSessionTreeContextMenuOnKeyDown('Escape'), true);
  assert.equal(shouldCloseSessionTreeContextMenuOnKeyDown('Enter'), false);
});
