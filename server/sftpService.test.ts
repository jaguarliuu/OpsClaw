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
      async listDirectory(_nodeId, path) {
        return connection.readDirectory(path);
      },
      async stat(_nodeId, path) {
        return connection.stat(path);
      },
      async mkdir(_nodeId, path) {
        return connection.mkdir(path);
      },
      async rename(_nodeId, fromPath, toPath) {
        return connection.rename(fromPath, toPath);
      },
      async unlink(_nodeId, path) {
        return connection.unlink(path);
      },
      async rmdir(_nodeId, path) {
        return connection.rmdir(path);
      },
    },
  });

  const result = await service.listDirectory({ nodeId: 'node-1', path: '/srv' });

  assert.equal(result.path, '/srv');
  assert.deepEqual(result.items, [
    {
      name: 'app.log',
      path: '/srv/app.log',
      kind: 'file',
      size: 128,
      mtimeMs: 1710000100000,
      permissions: '-rw-r--r--',
    },
    {
      name: 'current',
      path: '/srv/current',
      kind: 'symlink',
      size: 7,
      mtimeMs: 1710000200000,
      permissions: 'lrwxrwxrwx',
    },
    {
      name: 'logs',
      path: '/srv/logs',
      kind: 'directory',
      size: 0,
      mtimeMs: 1710000000000,
      permissions: 'drwxr-xr-x',
    },
  ]);
});

void test('sftpService validates destructive operation inputs and rejects empty delete targets', async () => {
  const service = createSftpService({
    connectionManager: {
      async listDirectory() {
        return [];
      },
      async stat() {
        return { mode: 0o100644 };
      },
      async mkdir() {},
      async rename() {},
      async unlink() {},
      async rmdir() {},
    },
  });

  await assert.rejects(
    async () => {
      await service.deletePaths({ nodeId: 'node-1', paths: [] });
    },
    /至少选择一个目标/
  );
  await assert.rejects(
    async () => {
      await service.deletePaths({ nodeId: 'node-1', paths: [' ', '\n'] });
    },
    /至少选择一个目标/
  );
  await assert.rejects(
    async () => {
      await service.renamePath({ nodeId: 'node-1', fromPath: '', toPath: '/next/path' });
    },
    /原路径不能为空/
  );
  await assert.rejects(
    async () => {
      await service.renamePath({ nodeId: 'node-1', fromPath: '/old/path', toPath: ' ' });
    },
    /目标路径不能为空/
  );
});

void test('sftpService deletePaths dispatches file and directory deletions by metadata', async () => {
  const connection = createFakeConnection();
  const service = createSftpService({
    connectionManager: {
      async listDirectory() {
        return [];
      },
      async stat(_nodeId, path) {
        return connection.stat(path);
      },
      async mkdir() {},
      async rename() {},
      async unlink(_nodeId, path) {
        return connection.unlink(path);
      },
      async rmdir(_nodeId, path) {
        return connection.rmdir(path);
      },
    },
  });

  const result = await service.deletePaths({ nodeId: 'node-1', paths: ['/srv/logs', '/srv/app.log'] });

  assert.deepEqual(result, { deletedPaths: ['/srv/logs', '/srv/app.log'] });
  assert.deepEqual(connection.operations, [
    'stat:/srv/logs',
    'rmdir:/srv/logs',
    'stat:/srv/app.log',
    'unlink:/srv/app.log',
  ]);
});

void test('sftpService getMetadata returns normalized metadata shape', async () => {
  const service = createSftpService({
    connectionManager: {
      async listDirectory() {
        return [];
      },
      async stat(_nodeId, path) {
        if (path === '/srv/logs') {
          return { mode: 0o040755, size: 0, mtime: 1710000000 };
        }

        return { mode: 0o100644, size: 1, mtime: 1710000100 };
      },
      async mkdir() {},
      async rename() {},
      async unlink() {},
      async rmdir() {},
    },
  });

  const result = await service.getMetadata({ nodeId: 'node-1', path: '/srv/logs' });
  assert.deepEqual(result, {
    name: 'logs',
    path: '/srv/logs',
    kind: 'directory',
    size: 0,
    mtimeMs: 1710000000000,
    permissions: 'drwxr-xr-x',
  });
});

void test('sftpConnectionManager reuses connection by nodeId and exposes manager-level wrappers', async () => {
  const connectCalls: string[] = [];
  const operations: string[] = [];
  const createClient: CreateSftpClient = async (node) => {
    connectCalls.push(node.id);
    return {
      async readDirectory(path) {
        operations.push(`readDirectory:${node.id}:${path}`);
        return [];
      },
      async stat(path) {
        operations.push(`stat:${node.id}:${path}`);
        return { mode: 0o100644 };
      },
      async mkdir(path) {
        operations.push(`mkdir:${node.id}:${path}`);
      },
      async rename(fromPath, toPath) {
        operations.push(`rename:${node.id}:${fromPath}->${toPath}`);
      },
      async unlink(path) {
        operations.push(`unlink:${node.id}:${path}`);
      },
      async rmdir(path) {
        operations.push(`rmdir:${node.id}:${path}`);
      },
      end() {
        operations.push(`end:${node.id}`);
      },
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
      async getHostKey() {
        return null;
      },
      async upsertHostKey() {},
    },
    createClient,
  });

  await manager.listDirectory('node-a', '/a');
  await manager.closeNode('node-a');
  await manager.listDirectory('node-a', '/a-2');
  await manager.stat('node-a', '/a/file.txt');
  await manager.mkdir('node-a', '/a/new');
  await manager.rename('node-a', '/a/old', '/a/new');
  await manager.unlink('node-a', '/a/file.txt');
  await manager.rmdir('node-a', '/a/old-dir');
  await manager.listDirectory('node-b', '/b');

  assert.deepEqual(connectCalls, ['node-a', 'node-a', 'node-b']);
  assert.deepEqual(operations, [
    'readDirectory:node-a:/a',
    'end:node-a',
    'readDirectory:node-a:/a-2',
    'stat:node-a:/a/file.txt',
    'mkdir:node-a:/a/new',
    'rename:node-a:/a/old->/a/new',
    'unlink:node-a:/a/file.txt',
    'rmdir:node-a:/a/old-dir',
    'readDirectory:node-b:/b',
  ]);
});

void test('sftpConnectionManager persists first-seen host key fingerprint', async () => {
  const upserts: Array<{ nodeId: string; algorithm: string; fingerprint: string }> = [];
  const createClient: CreateSftpClient = async (_node, options) => {
    await options.onHostKey({
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:first',
    });
    return createFakeConnection();
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
      async getHostKey() {
        return null;
      },
      async upsertHostKey(input) {
        upserts.push(input);
      },
    },
    createClient,
  });

  await manager.getOrCreate('node-1');
  assert.deepEqual(upserts, [
    {
      nodeId: 'node-1',
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:first',
    },
  ]);
});

void test('sftpConnectionManager allows matching stored fingerprint without rewriting record', async () => {
  const upserts: Array<{ nodeId: string; algorithm: string; fingerprint: string }> = [];
  const createClient: CreateSftpClient = async (_node, options) => {
    await options.onHostKey({
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:stable',
    });
    return createFakeConnection();
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
      async getHostKey() {
        return {
          nodeId: 'node-1',
          algorithm: 'ssh-ed25519',
          fingerprint: 'SHA256:stable',
          seenAt: '2026-01-01T00:00:00.000Z',
        };
      },
      async upsertHostKey(input) {
        upserts.push(input);
      },
    },
    createClient,
  });

  await manager.getOrCreate('node-1');
  assert.deepEqual(upserts, []);
});

void test('sftpConnectionManager rejects changed host key fingerprint', async () => {
  const createClient: CreateSftpClient = async (_node, options) => {
    await options.onHostKey({
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:changed',
    });
    return createFakeConnection();
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
      async getHostKey() {
        return {
          nodeId: 'node-1',
          algorithm: 'ssh-ed25519',
          fingerprint: 'SHA256:stable',
          seenAt: '2026-01-01T00:00:00.000Z',
        };
      },
      async upsertHostKey() {},
    },
    createClient,
  });

  await assert.rejects(
    async () => {
      await manager.getOrCreate('node-1');
    },
    /host key.*mismatch|host key.*changed/i
  );
});
