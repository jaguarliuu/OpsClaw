import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSftpApprovalRequest } from './sftpActionGateModel.js';

void test('buildSftpApprovalRequest creates overwrite upload approval card', () => {
  const request = buildSftpApprovalRequest({
    kind: 'overwrite_upload',
    nodeId: 'node-1',
    remotePath: '/srv/app/config.json',
    localPath: '/Users/eumenides/Desktop/config.json',
    openedAt: 1_712_345_678_900,
  });

  assert.equal(request.interactionKind, 'approval');
  assert.equal(request.riskLevel, 'high');
  assert.equal(request.blockingMode, 'hard_block');
  assert.equal(request.title, '覆盖远端文件');
  assert.match(request.message, /config\.json/);
  assert.deepEqual(request.actions, [
    { id: 'approve', label: '确认覆盖', kind: 'approve', style: 'danger' },
    { id: 'reject', label: '取消上传', kind: 'reject', style: 'secondary' },
  ]);
  assert.deepEqual(request.fields, [
    { type: 'display', key: 'remotePath', label: '远端路径', value: '/srv/app/config.json' },
    {
      type: 'display',
      key: 'localPath',
      label: '本地文件',
      value: '/Users/eumenides/Desktop/config.json',
    },
  ]);
  assert.deepEqual(request.metadata, {
    source: 'sftp_action_gate',
    kind: 'overwrite_upload',
    nodeId: 'node-1',
    remotePath: '/srv/app/config.json',
    localPath: '/Users/eumenides/Desktop/config.json',
  });
});

void test('buildSftpApprovalRequest creates batch delete approval card', () => {
  const request = buildSftpApprovalRequest({
    kind: 'batch_delete',
    nodeId: 'node-9',
    remotePaths: ['/var/log/app.log', '/var/log/app.log.1', '/var/log/app.log.2'],
    openedAt: 1_712_345_678_901,
  });

  assert.equal(request.interactionKind, 'approval');
  assert.equal(request.riskLevel, 'critical');
  assert.equal(request.title, '批量删除远端条目');
  assert.match(request.message, /3 个/);
  assert.deepEqual(request.actions, [
    { id: 'approve', label: '确认删除', kind: 'approve', style: 'danger' },
    { id: 'reject', label: '保留这些条目', kind: 'reject', style: 'secondary' },
  ]);
  assert.deepEqual(request.fields, [
    {
      type: 'display',
      key: 'items',
      label: '待删除条目',
      value: ['/var/log/app.log', '/var/log/app.log.1', '/var/log/app.log.2'].join('\n'),
    },
  ]);
  assert.deepEqual(request.metadata, {
    source: 'sftp_action_gate',
    kind: 'batch_delete',
    nodeId: 'node-9',
    remotePaths: ['/var/log/app.log', '/var/log/app.log.1', '/var/log/app.log.2'],
  });
});
