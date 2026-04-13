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
  try {
    await resetSqliteDatabaseForTests();
  } catch {
    // A failed initialization can leave a rejected cached promise in tests.
  }
  process.chdir(originalCwd);
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

void test('sftpStore persists host keys and resumable transfer tasks', async () => {
  const { getSqliteDatabase, resetSqliteDatabaseForTests } = await import('./database.js');
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

  await resetSqliteDatabaseForTests();

  const { createSftpStore: createSftpStoreAfterReload } = await import('./sftpStore.js');
  const reloadedStore = await createSftpStoreAfterReload();
  const hostKey = await reloadedStore.getHostKey('node-1');
  const resumable = await reloadedStore.listResumableTasks('node-1');

  assert.equal(hostKey?.fingerprint, 'SHA256:abc');
  assert.equal(resumable.length, 1);
  assert.equal(resumable[0]?.lastConfirmedOffset, 512);
  assert.equal(resumable[0]?.status, 'paused');
});

void test('database migration fails fast when legacy transfer task rows contain invalid status', async () => {
  const { seedSqliteDatabaseFileForTests, getSqliteDatabase } = await import('./database.js');

  await seedSqliteDatabaseFileForTests((database) => {
    database.run(`
      CREATE TABLE groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database.run(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_name TEXT NOT NULL DEFAULT '默认',
        group_id TEXT REFERENCES groups(id),
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 22,
        username TEXT NOT NULL,
        auth_mode TEXT NOT NULL,
        password TEXT,
        private_key TEXT,
        passphrase TEXT,
        password_encrypted TEXT,
        private_key_encrypted TEXT,
        passphrase_encrypted TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database.run(`
      INSERT INTO nodes (
        id, name, group_name, host, port, username, auth_mode, note, created_at, updated_at
      ) VALUES (
        'node-legacy', 'node-legacy', '默认', '127.0.0.1', 22, 'root', 'password', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
    `);
    database.run(`
      CREATE TABLE sftp_transfer_tasks (
        task_id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        local_path TEXT NOT NULL,
        remote_path TEXT NOT NULL,
        temp_local_path TEXT,
        temp_remote_path TEXT,
        total_bytes INTEGER,
        transferred_bytes INTEGER NOT NULL,
        last_confirmed_offset INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL,
        error_message TEXT,
        checksum_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database.run(`
      INSERT INTO sftp_transfer_tasks (
        task_id, node_id, direction, local_path, remote_path, temp_local_path, temp_remote_path,
        total_bytes, transferred_bytes, last_confirmed_offset, chunk_size, status, retry_count,
        error_message, checksum_status, created_at, updated_at
      ) VALUES (
        'legacy-task-1', 'node-legacy', 'upload', '/tmp/a.txt', '/root/a.txt', NULL, '/root/.tmp',
        1024, 512, 512, 262144, 'unknown_status', 0,
        NULL, 'pending', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
    `);
  });

  await assert.rejects(
    async () => {
      await getSqliteDatabase();
    },
    /Invalid sftp_transfer_tasks status value/
  );
});
