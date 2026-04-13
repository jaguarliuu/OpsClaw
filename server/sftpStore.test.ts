import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const originalCwd = process.cwd();

let tempRoot = '';

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opsclaw-sftp-store-'));
  process.chdir(tempRoot);
});

test.beforeEach(async () => {
  const { removeSqliteDatabaseFileForTests } = await import('./database.js');
  await removeSqliteDatabaseFileForTests();
});

test.after(async () => {
  const { resetSqliteDatabaseForTests } = await import('./database.js');
  await resetSqliteDatabaseForTests();
  process.chdir(originalCwd);
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

void test('sftpStore persists host keys and resumable transfer tasks', async () => {
  const { getSqliteDatabase } = await import('./database.js');
  const now = new Date().toISOString();
  const { database } = await getSqliteDatabase();
  database.run(
    `
      INSERT INTO nodes (
        id, name, group_name, host, port, username, auth_mode, note, created_at, updated_at
      ) VALUES (
        :id, :name, :groupName, :host, :port, :username, :authMode, :note, :createdAt, :updatedAt
      )
    `,
    {
      ':id': 'node-1',
      ':name': 'node-1',
      ':groupName': '默认',
      ':host': '127.0.0.1',
      ':port': 22,
      ':username': 'root',
      ':authMode': 'password',
      ':note': '',
      ':createdAt': now,
      ':updatedAt': now,
    }
  );

  const { createSftpStore } = await import('./sftpStore.js');
  const store = await createSftpStore();

  await store.upsertHostKey({
    nodeId: 'node-1',
    algorithm: 'ssh-ed25519',
    fingerprint: 'SHA256:abc',
  });

  await store.upsertTransferTask({
    taskId: 'task-1',
    nodeId: 'node-1',
    direction: 'upload',
    localPath: '/tmp/a.txt',
    remotePath: '/root/a.txt',
    tempRemotePath: '/root/.opsclaw-upload-task-1.tmp',
    totalBytes: 1024,
    transferredBytes: 512,
    lastConfirmedOffset: 512,
    chunkSize: 262144,
    status: 'paused',
    retryCount: 1,
    errorMessage: null,
    checksumStatus: 'pending',
  });

  const hostKey = await store.getHostKey('node-1');
  const resumable = await store.listResumableTasks('node-1');

  assert.equal(hostKey?.fingerprint, 'SHA256:abc');
  assert.equal(resumable[0]?.lastConfirmedOffset, 512);
  assert.equal(resumable[0]?.status, 'paused');
});
