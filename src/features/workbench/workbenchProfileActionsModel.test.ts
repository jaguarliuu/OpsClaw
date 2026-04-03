import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConnectionProfile } from './types.js';
import {
  buildDeleteProfileDialogState,
  buildEditProfileState,
  buildOpenNewConnectionState,
  clearDeleteProfileDialogState,
  getProfileActionErrorMessage,
} from './workbenchProfileActionsModel.js';
import { defaultFormValues } from './workbenchPageModel.js';

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

void test('buildOpenNewConnectionState resets selection and opens the connection modal without touching sidebar state', () => {
  const result = buildOpenNewConnectionState();

  assert.deepEqual(result, {
    formValues: defaultFormValues,
    isConnectionPanelOpen: true,
    modalError: null,
    selectedProfileId: null,
  });
  assert.equal('isSidebarCollapsed' in result, false);
});

void test('buildEditProfileState marks the profile as loading in the side panel', () => {
  assert.deepEqual(buildEditProfileState(sampleProfile.id), {
    isConnectionPanelOpen: true,
    isSubmittingConnection: true,
    modalError: null,
    selectedProfileId: 'node-1',
  });
});

void test('buildDeleteProfileDialogState opens the confirm dialog for the selected profile', () => {
  assert.deepEqual(buildDeleteProfileDialogState(sampleProfile), {
    deleteDialogError: null,
    pendingDeleteProfile: sampleProfile,
  });
});

void test('clearDeleteProfileDialogState closes the delete dialog and clears its error', () => {
  assert.deepEqual(clearDeleteProfileDialogState(), {
    deleteDialogError: null,
    pendingDeleteProfile: null,
  });
});

void test('getProfileActionErrorMessage prefers Error messages and falls back to provided copy', () => {
  assert.equal(getProfileActionErrorMessage(new Error('boom'), '节点保存失败。'), 'boom');
  assert.equal(getProfileActionErrorMessage('unexpected', '节点保存失败。'), '节点保存失败。');
});
