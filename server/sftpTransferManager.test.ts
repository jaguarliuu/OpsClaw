import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { SftpTransferTaskRecord, SftpTransferTaskRecordInput } from './sftpStore.js';

type FakeStore = {
  readonly writes: SftpTransferTaskRecord[];
  readonly tasks: Map<string, SftpTransferTaskRecord>;
  upsertTransferTask: (input: SftpTransferTaskRecordInput) => Promise<void>;
  listResumableTasks: (nodeId: string) => Promise<SftpTransferTaskRecord[]>;
};

function createFakeStore(initialTasks: SftpTransferTaskRecord[] = []): FakeStore {
  const tasks = new Map(initialTasks.map((task) => [task.taskId, task]));
  const writes: SftpTransferTaskRecord[] = [];

  return {
    writes,
    tasks,
    async upsertTransferTask(input) {
      const now = new Date().toISOString();
      const nextRecord: SftpTransferTaskRecord = {
        taskId: input.taskId,
        nodeId: input.nodeId,
        direction: input.direction,
        localPath: input.localPath,
        remotePath: input.remotePath,
        tempLocalPath: input.tempLocalPath ?? null,
        tempRemotePath: input.tempRemotePath ?? null,
        totalBytes: input.totalBytes ?? null,
        transferredBytes: input.transferredBytes,
        lastConfirmedOffset: input.lastConfirmedOffset,
        chunkSize: input.chunkSize,
        status: input.status,
        retryCount: input.retryCount,
        errorMessage: input.errorMessage ?? null,
        checksumStatus: input.checksumStatus,
        createdAt: tasks.get(input.taskId)?.createdAt ?? now,
        updatedAt: now,
      };
      tasks.set(nextRecord.taskId, nextRecord);
      writes.push(nextRecord);
    },
    async listResumableTasks(nodeId) {
      return [...tasks.values()].filter((task) => task.nodeId === nodeId);
    },
  };
}

function createFakeConnectionManager(options?: { failOnWriteCall?: number }) {
  const files = new Map<string, Buffer>();
  const writeCalls: Array<{ path: string; offset: number; chunk: string }> = [];
  const renameCalls: Array<{ fromPath: string; toPath: string }> = [];
  const statCalls: string[] = [];
  let writeCallCount = 0;

  return {
    files,
    writeCalls,
    renameCalls,
    statCalls,
    async stat(_nodeId: string, remotePath: string) {
      statCalls.push(remotePath);
      const file = files.get(remotePath);
      if (!file) {
        throw new Error(`missing remote file: ${remotePath}`);
      }

      return { size: file.length };
    },
    async writeChunk(_nodeId: string, remotePath: string, chunk: Buffer, offset: number) {
      writeCallCount += 1;
      if (writeCallCount === options?.failOnWriteCall) {
        throw new Error(`write failed at call ${writeCallCount}`);
      }

      const existing = offset === 0 ? Buffer.alloc(0) : (files.get(remotePath) ?? Buffer.alloc(0));
      const requiredLength = offset + chunk.length;
      const next = Buffer.alloc(Math.max(existing.length, requiredLength));
      existing.copy(next, 0, 0, existing.length);
      chunk.copy(next, offset, 0, chunk.length);
      files.set(remotePath, next);
      writeCalls.push({ path: remotePath, offset, chunk: chunk.toString('utf8') });
    },
    async rename(_nodeId: string, fromPath: string, toPath: string) {
      renameCalls.push({ fromPath, toPath });
      const file = files.get(fromPath) ?? Buffer.alloc(0);
      files.set(toPath, file);
      files.delete(fromPath);
    },
  };
}

const originalCwd = process.cwd();
let tempRoot = '';

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opsclaw-sftp-transfer-manager-'));
  process.chdir(tempRoot);
});

test.after(async () => {
  process.chdir(originalCwd);
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

void test('uploadFile checkpoints each completed chunk and keeps temp remote path for resume after a failure', async () => {
  const localPath = path.join(tempRoot, 'upload-source.txt');
  await fs.writeFile(localPath, 'abcdef', 'utf8');

  const store = createFakeStore();
  const connectionManager = createFakeConnectionManager({ failOnWriteCall: 2 });
  const { createSftpTransferManager } = await import('./sftpTransferManager.js');
  const manager = createSftpTransferManager({
    sftpStore: store,
    connectionManager,
  });

  await assert.rejects(
    async () => {
      await manager.uploadFile({
        taskId: 'task-1',
        nodeId: 'node-1',
        localPath,
        remotePath: '/remote/file.txt',
        chunkSize: 2,
      });
    },
    /write failed at call 2/
  );

  assert.deepEqual(connectionManager.writeCalls, [
    {
      path: '/remote/.opsclaw-upload-task-1.tmp',
      offset: 0,
      chunk: 'ab',
    },
  ]);
  const task = store.tasks.get('task-1');
  assert.ok(task);
  assert.equal(task?.status, 'paused');
  assert.equal(task?.lastConfirmedOffset, 2);
  assert.equal(task?.transferredBytes, 2);
  assert.equal(task?.tempRemotePath, '/remote/.opsclaw-upload-task-1.tmp');
  assert.equal(task?.errorMessage, 'write failed at call 2');
  assert.deepEqual(connectionManager.renameCalls, []);
});

void test('uploadFile rejects chunkSize <= 0 before creating a false-success task', async () => {
  const localPath = path.join(tempRoot, 'zero-chunk-size-source.txt');
  await fs.writeFile(localPath, 'abcdef', 'utf8');

  const store = createFakeStore();
  const connectionManager = createFakeConnectionManager();
  const { createSftpTransferManager } = await import('./sftpTransferManager.js');
  const manager = createSftpTransferManager({
    sftpStore: store,
    connectionManager,
  });

  await assert.rejects(
    async () => {
      await manager.uploadFile({
        taskId: 'task-zero',
        nodeId: 'node-1',
        localPath,
        remotePath: '/remote/file.txt',
        chunkSize: 0,
      });
    },
    /chunkSize must be greater than 0/
  );

  assert.equal(store.tasks.size, 0);
  assert.deepEqual(connectionManager.writeCalls, []);
  assert.deepEqual(connectionManager.renameCalls, []);
});

void test('uploadFile resumes from stored checkpoint and renames temp remote file after completion', async () => {
  const localPath = path.join(tempRoot, 'resume-source.txt');
  await fs.writeFile(localPath, 'abcdef', 'utf8');

  const tempRemotePath = '/remote/.opsclaw-upload-task-2.tmp';
  const store = createFakeStore([
    {
      taskId: 'task-2',
      nodeId: 'node-1',
      direction: 'upload',
      localPath,
      remotePath: '/remote/file.txt',
      tempLocalPath: null,
      tempRemotePath,
      totalBytes: 6,
      transferredBytes: 2,
      lastConfirmedOffset: 2,
      chunkSize: 2,
      status: 'paused',
      retryCount: 0,
      errorMessage: 'network dropped',
      checksumStatus: 'pending',
      createdAt: '2026-04-13T00:00:00.000Z',
      updatedAt: '2026-04-13T00:00:00.000Z',
    },
  ]);
  const connectionManager = createFakeConnectionManager();
  connectionManager.files.set(tempRemotePath, Buffer.from('ab', 'utf8'));
  const { createSftpTransferManager } = await import('./sftpTransferManager.js');
  const manager = createSftpTransferManager({
    sftpStore: store,
    connectionManager,
  });

  const result = await manager.uploadFile({
    taskId: 'task-2',
    nodeId: 'node-1',
    localPath,
    remotePath: '/remote/file.txt',
    chunkSize: 2,
  });

  assert.deepEqual(connectionManager.writeCalls, [
    {
      path: tempRemotePath,
      offset: 2,
      chunk: 'cd',
    },
    {
      path: tempRemotePath,
      offset: 4,
      chunk: 'ef',
    },
  ]);
  assert.deepEqual(connectionManager.renameCalls, [
    {
      fromPath: tempRemotePath,
      toPath: '/remote/file.txt',
    },
  ]);
  assert.equal(connectionManager.files.get('/remote/file.txt')?.toString('utf8'), 'abcdef');
  assert.equal(connectionManager.files.has(tempRemotePath), false);
  assert.equal(result.status, 'completed');
  assert.equal(result.transferredBytes, 6);
  assert.equal(result.lastConfirmedOffset, 6);
  assert.equal(result.tempRemotePath, null);
  assert.equal(result.errorMessage, null);
});

void test('uploadFile restarts from offset 0 when temp remote size is stale for a completed-offset resume', async () => {
  const localPath = path.join(tempRoot, 'stale-temp-source.txt');
  await fs.writeFile(localPath, 'abcdef', 'utf8');

  const tempRemotePath = '/remote/.opsclaw-upload-task-stale.tmp';
  const store = createFakeStore([
    {
      taskId: 'task-stale',
      nodeId: 'node-1',
      direction: 'upload',
      localPath,
      remotePath: '/remote/file.txt',
      tempLocalPath: null,
      tempRemotePath,
      totalBytes: 6,
      transferredBytes: 6,
      lastConfirmedOffset: 6,
      chunkSize: 2,
      status: 'paused',
      retryCount: 0,
      errorMessage: 'previous run interrupted',
      checksumStatus: 'pending',
      createdAt: '2026-04-13T00:00:00.000Z',
      updatedAt: '2026-04-13T00:00:00.000Z',
    },
  ]);
  const connectionManager = createFakeConnectionManager();
  connectionManager.files.set(tempRemotePath, Buffer.from('abcdefjunk', 'utf8'));
  const { createSftpTransferManager } = await import('./sftpTransferManager.js');
  const manager = createSftpTransferManager({
    sftpStore: store,
    connectionManager,
  });

  const result = await manager.uploadFile({
    taskId: 'task-stale',
    nodeId: 'node-1',
    localPath,
    remotePath: '/remote/file.txt',
    chunkSize: 2,
  });

  assert.deepEqual(connectionManager.statCalls, [tempRemotePath, tempRemotePath]);
  assert.deepEqual(connectionManager.writeCalls, [
    { path: tempRemotePath, offset: 0, chunk: 'ab' },
    { path: tempRemotePath, offset: 2, chunk: 'cd' },
    { path: tempRemotePath, offset: 4, chunk: 'ef' },
  ]);
  assert.deepEqual(connectionManager.renameCalls, [
    {
      fromPath: tempRemotePath,
      toPath: '/remote/file.txt',
    },
  ]);
  assert.equal(connectionManager.files.get('/remote/file.txt')?.toString('utf8'), 'abcdef');
  assert.equal(result.transferredBytes, 6);
  assert.equal(result.status, 'completed');
});

void test('uploadFile blocks rename when final temp remote size does not match expected totalBytes', async () => {
  const localPath = path.join(tempRoot, 'final-size-mismatch-source.txt');
  await fs.writeFile(localPath, 'abcdef', 'utf8');

  const connectionManager = createFakeConnectionManager();
  const originalStat = connectionManager.stat;
  let statCallCount = 0;
  connectionManager.stat = async (nodeId: string, remotePath: string) => {
    statCallCount += 1;
    if (statCallCount === 1) {
      return { size: 5 };
    }
    return originalStat(nodeId, remotePath);
  };
  const store = createFakeStore();
  const { createSftpTransferManager } = await import('./sftpTransferManager.js');
  const manager = createSftpTransferManager({
    sftpStore: store,
    connectionManager,
  });

  await assert.rejects(
    async () => {
      await manager.uploadFile({
        taskId: 'task-final-size-mismatch',
        nodeId: 'node-1',
        localPath,
        remotePath: '/remote/file.txt',
        chunkSize: 2,
      });
    },
    /Remote temp file size mismatch before finalize/
  );

  assert.deepEqual(connectionManager.renameCalls, []);
  assert.equal(connectionManager.files.has('/remote/file.txt'), false);
  const task = store.tasks.get('task-final-size-mismatch');
  assert.equal(task?.status, 'paused');
  assert.equal(task?.errorMessage, 'Remote temp file size mismatch before finalize.');
  assert.equal(task?.tempRemotePath, '/remote/.opsclaw-upload-task-final-size-mismatch.tmp');
});

void test('uploadFile succeeds for zero-byte files by creating an empty temp artifact before finalize', async () => {
  const localPath = path.join(tempRoot, 'empty-source.txt');
  await fs.writeFile(localPath, '', 'utf8');

  const connectionManager = createFakeConnectionManager();
  const store = createFakeStore();
  const { createSftpTransferManager } = await import('./sftpTransferManager.js');
  const manager = createSftpTransferManager({
    sftpStore: store,
    connectionManager,
  });

  const result = await manager.uploadFile({
    taskId: 'task-empty',
    nodeId: 'node-1',
    localPath,
    remotePath: '/remote/file.txt',
    chunkSize: 2,
  });

  assert.deepEqual(connectionManager.writeCalls, [
    {
      path: '/remote/.opsclaw-upload-task-empty.tmp',
      offset: 0,
      chunk: '',
    },
  ]);
  assert.deepEqual(connectionManager.renameCalls, [
    {
      fromPath: '/remote/.opsclaw-upload-task-empty.tmp',
      toPath: '/remote/file.txt',
    },
  ]);
  assert.equal(connectionManager.files.get('/remote/file.txt')?.length, 0);
  assert.equal(result.status, 'completed');
  assert.equal(result.totalBytes, 0);
  assert.equal(result.transferredBytes, 0);
});
