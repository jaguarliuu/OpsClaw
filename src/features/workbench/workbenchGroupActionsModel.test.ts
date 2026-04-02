import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConnectionGroup, SavedConnectionProfile } from './types.js';
import {
  buildCreateGroupDialogState,
  buildDeleteGroupDialogState,
  buildMoveProfileDialogState,
  buildRenameGroupDialogState,
  clearDeleteGroupDialogState,
  clearGroupDialogState,
  clearMoveProfileDialogState,
  validateGroupDialogName,
} from './workbenchGroupActionsModel.js';

const sampleGroup: SavedConnectionGroup = {
  id: 'group-1',
  name: '生产',
  isDefault: false,
  profiles: [],
};

const defaultGroup: SavedConnectionGroup = {
  id: 'group-default',
  name: '默认',
  isDefault: true,
  profiles: [],
};

const sampleProfile: SavedConnectionProfile = {
  id: 'node-1',
  name: 'prod-api',
  groupId: 'group-1',
  group: '生产',
  jumpHostId: null,
  host: '10.0.0.8',
  port: 22,
  username: 'ubuntu',
  authMode: 'password',
  note: '密码连接',
};

void test('buildCreateGroupDialogState resets dialog state for create flow', () => {
  assert.deepEqual(buildCreateGroupDialogState(), {
    error: null,
    mode: 'create',
    name: '',
    target: null,
  });
});

void test('buildRenameGroupDialogState preloads the target group name', () => {
  assert.deepEqual(buildRenameGroupDialogState(sampleGroup), {
    error: null,
    mode: 'rename',
    name: '生产',
    target: sampleGroup,
  });
});

void test('validateGroupDialogName trims user input and rejects blanks', () => {
  assert.deepEqual(validateGroupDialogName('  生产  '), {
    error: null,
    normalizedName: '生产',
  });
  assert.deepEqual(validateGroupDialogName('   '), {
    error: '请输入分组名称。',
    normalizedName: '',
  });
});

void test('buildMoveProfileDialogState falls back to default group id when profile has no group', () => {
  assert.deepEqual(
    buildMoveProfileDialogState({ ...sampleProfile, groupId: null }, defaultGroup.id),
    {
      error: null,
      profile: { ...sampleProfile, groupId: null },
      targetGroupId: defaultGroup.id,
    }
  );
});

void test('clear dialog state helpers close the group and move dialogs', () => {
  assert.deepEqual(clearGroupDialogState(), {
    error: null,
    mode: null,
    name: '',
    target: null,
  });
  assert.deepEqual(clearMoveProfileDialogState(), {
    error: null,
    profile: null,
    targetGroupId: null,
  });
});

void test('buildDeleteGroupDialogState opens the delete confirm dialog for a non-default group', () => {
  assert.deepEqual(buildDeleteGroupDialogState(sampleGroup), {
    error: null,
    pendingDeleteGroup: sampleGroup,
  });
});

void test('clearDeleteGroupDialogState closes the delete group dialog', () => {
  assert.deepEqual(clearDeleteGroupDialogState(), {
    error: null,
    pendingDeleteGroup: null,
  });
});
