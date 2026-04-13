import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSftpConnectionManager,
  type CreateSftpClient,
  type SftpConnectionClient,
} from './sftpConnectionManager.js';
import { createSftpService } from './sftpService.js';

function createFakeConnection(): SftpConnectionClient & {
  readonly operations: string[];
} {
  const operations: string[] = [];

  return {
    operations,
    async readDirectory(path) {
      operations.push(`readDirectory:${path}`);
      return [
        {
          filename: 'logs',
          attrs: { mode: 0o040755, size: 0, mtime: 1710000000 },
        },
        {
          filename: 'app.log',
          attrs: { mode: 0o100644, size: 128, mtime: 1710000100 },
        },
        {
          filename: 'current',
          attrs: { mode: 0o120777, size: 7, mtime: 1710000200 },
        },
      ];
    },
    async stat(path) {
      operations.push(`stat:${path}`);
      if (path.endsWith('/logs')) {
        return { mode: 0o040755, size: 0, mtime: 1710000000 };
      }

      return { mode: 0o100644, size: 128, mtime: 1710000100 };
    },
    async mkdir(path) {
      operations.push(`mkdir:${path}`);
    },
    async rename(sourcePath, targetPath) {
      operations.push(`rename:${sourcePath}->${targetPath}`);
    },
    async unlink(path) {
      operations.push(`unlink:${path}`);
    },
    async rmdir(path) {
      operations.push(`rmdir:${path}`);
    },
    end() {
      operations.push('end');
    },
  };
}

void test('sftpService listDirectory normalizes entry type, permissions and metadata', async () => {
  const connection = createFakeConnection();
  const service = createSftpService({
    connectionManager: {
      async getOrCreate() {
        return connection;
      },
    },
  });

  const result = await service.listDirectory('node-1', '/srv');

  assert.equal(result.path, '/srv');
  assert.deepEqual(result.entries, [
    {
      name: 'app.log',
      path: '/srv/app.log',
      type: 'file',
      size: 128,
      modifiedAt: '2024-03-09T16:01:40.000Z',
      permissions: '-rw-r--r--',
    },
    {
      name: 'current',
      path: '/srv/current',
      type: 'symlink',
      size: 7,
      modifiedAt: '2024-03-09T16:03:20.000Z',
      permissions: 'lrwxrwxrwx',
    },
    {
      name: 'logs',
      path: '/srv/logs',
      type: 'directory',
      size: 0,
      modifiedAt: '2024-03-09T16:00:00.000Z',
      permissions: 'drwxr-xr-x',
    },
  ]);
});

void test('sftpService validates destructive operation inputs and rejects empty delete targets', async () => {
  const service = createSftpService({
    connectionManager: {
      async getOrCreate() {
        return createFakeConnection();
      },
    },
  });

  await assert.rejects(
    async () => {
      await service.deletePaths('node-1', []);
    },
    /删除目标不能为空/
  );
  await assert.rejects(
    async () => {
      await service.deletePaths('node-1', [' ', '\n']);
    },
    /删除目标不能为空/
  );
  await assert.rejects(
    async () => {
      await service.renamePath('node-1', '', '/next/path');
    },
    /原路径不能为空/
  );
  await assert.rejects(
    async () => {
      await service.renamePath('node-1', '/old/path', ' ');
    },
    /目标路径不能为空/
  );
});

void test('sftpService deletePaths dispatches file and directory deletions by metadata', async () => {
  const connection = createFakeConnection();
  const service = createSftpService({
    connectionManager: {
      async getOrCreate() {
        return connection;
      },
    },
  });

  const result = await service.deletePaths('node-1', ['/srv/logs', '/srv/app.log']);

  assert.deepEqual(result, { deletedPaths: ['/srv/logs', '/srv/app.log'] });
  assert.deepEqual(connection.operations, [
    'stat:/srv/logs',
    'rmdir:/srv/logs',
    'stat:/srv/app.log',
    'unlink:/srv/app.log',
  ]);
});

void test('sftpConnectionManager reuses connection by nodeId and isolates different nodes', async () => {
  const connectCalls: string[] = [];
  const createClient: CreateSftpClient = async (node) => {
    connectCalls.push(node.id);
    return {
      async readDirectory() {
        return [];
      },
      async stat() {
        return { mode: 0o100644 };
      },
      async mkdir() {},
      async rename() {},
      async unlink() {},
      async rmdir() {},
      end() {},
    };
  };

  const manager = createSftpConnectionManager({
    nodeStore: {
      getNodeWithSecrets(nodeId) {
        return {
          id: nodeId,
          name: nodeId,
          groupId: null,
          groupName: '默认',
          jumpHostId: null,
          host: '127.0.0.1',
          port: 22,
          username: 'root',
          authMode: 'password',
          note: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          password: 'secret',
          privateKey: null,
          passphrase: null,
        };
      },
    },
    sftpStore: {
      async upsertHostKey() {},
    },
    createClient,
  });

  const nodeA1 = await manager.getOrCreate('node-a');
  const nodeA2 = await manager.getOrCreate('node-a');
  const nodeB = await manager.getOrCreate('node-b');

  assert.equal(nodeA1, nodeA2);
  assert.notEqual(nodeA1, nodeB);
  assert.deepEqual(connectCalls, ['node-a', 'node-b']);
});
