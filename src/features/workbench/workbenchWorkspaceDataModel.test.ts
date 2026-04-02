import assert from 'node:assert/strict';
import test from 'node:test';

import type { GroupRecord, NodeSummaryRecord } from './api.js';
import {
  buildNodeOnlineStatus,
  getWorkspaceDataErrorMessage,
  loadWorkspaceData,
} from './workbenchWorkspaceDataModel.js';

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

const sampleGroup: GroupRecord = {
  id: 'group-1',
  name: '生产',
  nodeCount: 1,
  createdAt: '2026-03-30T00:00:00.000Z',
  updatedAt: '2026-03-30T00:00:00.000Z',
};

void test('loadWorkspaceData returns groups and mapped profiles', async () => {
  const workspaceData = await loadWorkspaceData({
    fetchNodes: async () => [sampleNodeSummary],
    fetchGroups: async () => [sampleGroup],
  });

  assert.deepEqual(workspaceData.groups, [sampleGroup]);
  assert.deepEqual(workspaceData.profiles, [
    {
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
    },
  ]);
});

void test('buildNodeOnlineStatus reduces ping-all payload to boolean status map', () => {
  assert.deepEqual(
    buildNodeOnlineStatus({
      'node-1': { online: true, latencyMs: 13 },
      'node-2': { online: false },
    }),
    {
      'node-1': true,
      'node-2': false,
    }
  );
});

void test('getWorkspaceDataErrorMessage normalizes unknown errors', () => {
  assert.equal(getWorkspaceDataErrorMessage(new Error('boom')), 'boom');
  assert.equal(getWorkspaceDataErrorMessage('unexpected'), '节点加载失败。');
});
