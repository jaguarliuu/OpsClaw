import assert from 'node:assert/strict';
import test from 'node:test';

import type { GroupRecord, NodeDetailRecord, NodeSummaryRecord } from './api.js';
import type { SavedConnectionProfile } from './types.js';
import {
  buildGroupTree,
  buildNodeInput,
  defaultFormValues,
  mapNodeDetailToFormValues,
  mapNodeToProfile,
  upsertProfile,
  validateForm,
} from './workbenchPageModel.js';

const sampleNodeSummary: NodeSummaryRecord = {
  id: 'node-1',
  name: 'prod-api',
  groupId: 'group-1',
  groupName: '生产',
  jumpHostId: null,
  host: '10.0.0.8',
  port: 22,
  username: 'ubuntu',
  authMode: 'password',
  note: '密码连接',
  createdAt: '2026-03-30T00:00:00.000Z',
  updatedAt: '2026-03-30T00:00:00.000Z',
};

void test('mapNodeDetailToFormValues clears secrets but preserves saved-secret flags', () => {
  const node: NodeDetailRecord = {
    ...sampleNodeSummary,
    password: null,
    privateKey: null,
    passphrase: null,
    hasPassword: true,
    hasPrivateKey: false,
    hasPassphrase: false,
  };

  assert.deepEqual(mapNodeDetailToFormValues(node), {
    label: 'prod-api',
    host: '10.0.0.8',
    port: '22',
    username: 'ubuntu',
    authMode: 'password',
    password: '',
    hasSavedPassword: true,
    privateKey: '',
    hasSavedPrivateKey: false,
    passphrase: '',
    hasSavedPassphrase: false,
    jumpHostId: '',
  });
});

void test('buildGroupTree keeps known groups and creates fallback groups for orphaned profiles', () => {
  const groups: GroupRecord[] = [
    {
      id: 'group-1',
      name: '生产',
      nodeCount: 1,
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
    },
  ];
  const orphanProfile: SavedConnectionProfile = {
    ...mapNodeToProfile(sampleNodeSummary),
    id: 'node-2',
    groupId: null,
    group: '默认',
  };

  const tree = buildGroupTree(groups, [mapNodeToProfile(sampleNodeSummary), orphanProfile]);

  assert.equal(tree.length, 2);
  assert.equal(tree[0]?.name, '生产');
  assert.equal(tree[0]?.profiles.length, 1);
  assert.equal(tree[1]?.name, '默认');
  assert.equal(tree[1]?.isDefault, true);
  assert.equal(tree[1]?.profiles[0]?.id, 'node-2');
});

void test('validateForm allows edit flows to keep saved secrets and rejects invalid ports', () => {
  assert.equal(
    validateForm({
      ...defaultFormValues,
      host: '10.0.0.8',
      username: 'ubuntu',
      hasSavedPassword: true,
    }),
    null
  );

  assert.equal(
    validateForm({
      ...defaultFormValues,
      host: '10.0.0.8',
      username: 'ubuntu',
      port: '70000',
    }),
    '端口必须是 1 到 65535 之间的整数。'
  );
});

void test('buildNodeInput keeps blank edit secrets undefined and falls back to 默认 group', () => {
  const payload = buildNodeInput(
    {
      ...defaultFormValues,
      label: 'prod-api',
      host: '10.0.0.8',
      username: 'ubuntu',
      authMode: 'privateKey',
      privateKey: '',
      passphrase: '',
    },
    null
  );

  assert.deepEqual(payload, {
    name: 'prod-api',
    groupId: undefined,
    groupName: '默认',
    jumpHostId: undefined,
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    authMode: 'privateKey',
    password: undefined,
    privateKey: undefined,
    passphrase: undefined,
    note: '密钥连接',
  });
});

void test('upsertProfile replaces matching ids', () => {
  const existing = mapNodeToProfile(sampleNodeSummary);
  const updated = { ...existing, name: 'prod-api-2' };

  assert.deepEqual(upsertProfile([existing], updated), [updated]);
});
