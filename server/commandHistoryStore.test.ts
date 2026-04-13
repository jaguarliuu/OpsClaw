import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const originalCwd = process.cwd();

let tempRoot = '';

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opsclaw-command-history-'));
  process.chdir(tempRoot);
});

test.after(async () => {
  const { getSqliteDatabase } = await import('./database.js');
  const sqlite = await getSqliteDatabase();
  await sqlite.close();
  process.chdir(originalCwd);
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

void test('upsertCommand updates an existing command without losing persisted fields', async () => {
  const { createCommandHistoryStore } = await import('./commandHistoryStore.js');
  const store = await createCommandHistoryStore();

  const first = store.upsertCommand('sudo lsof -i :10022', 'node-1');
  const second = store.upsertCommand('sudo lsof -i :10022', 'node-1');

  assert.equal(second.id, first.id);
  assert.equal(second.command, first.command);
  assert.equal(second.nodeId, 'node-1');
  assert.equal(second.rank, 2);
  assert.equal(typeof second.createdAt, 'string');
  assert.match(second.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(second.lastUsed >= first.lastUsed);
});

void test('searchCommands excludes obvious secret-like entries from autocomplete results', async () => {
  const { createCommandHistoryStore } = await import('./commandHistoryStore.js');
  const store = await createCommandHistoryStore();

  store.upsertCommand('root123', 'node-1');
  store.upsertCommand('mysql --password=secret', 'node-1');
  store.upsertCommand('sudo systemctl restart nginx', 'node-1');

  const results = store.searchCommands('r', 'node-1');

  assert.equal(results.some((item) => item.command === 'root123'), false);
  assert.equal(results.some((item) => item.command === 'mysql --password=secret'), false);
  assert.equal(
    results.some((item) => item.command === 'sudo systemctl restart nginx'),
    true
  );
});
