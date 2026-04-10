import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const originalCwd = process.cwd();

let tempRoot = '';

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opsclaw-node-inspection-'));
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

void test('upsertProfile persists and updates a node inspection profile', async () => {
  const { createNodeInspectionStore } = await import('./nodeInspectionStore.js');
  const { DEFAULT_NODE_INSPECTION_SCRIPT } = await import('./nodeInspectionScript.js');
  const store = await createNodeInspectionStore();

  const created = store.upsertProfile({
    nodeId: 'node-1',
    scriptId: 'script-default-1',
    dashboardSchemaKey: DEFAULT_NODE_INSPECTION_SCRIPT.schemaKey,
  });

  assert.equal(created.nodeId, 'node-1');
  assert.equal(created.scriptId, 'script-default-1');
  assert.equal(created.dashboardSchemaKey, 'default_system');
  assert.deepEqual(Object.keys(created).sort(), [
    'createdAt',
    'dashboardSchemaKey',
    'nodeId',
    'scriptId',
    'updatedAt',
  ]);

  const updated = store.upsertProfile({
    nodeId: 'node-1',
    scriptId: 'script-custom',
    dashboardSchemaKey: 'custom_schema',
  });

  assert.equal(updated.nodeId, 'node-1');
  assert.equal(updated.scriptId, 'script-custom');
  assert.equal(updated.dashboardSchemaKey, 'custom_schema');

  const profile = store.getProfile('node-1');
  assert.deepEqual(profile, updated);
});

void test('default inspection script is a shell script and prints valid json only', async () => {
  const { DEFAULT_NODE_INSPECTION_SCRIPT } = await import('./nodeInspectionScript.js');

  assert.equal(DEFAULT_NODE_INSPECTION_SCRIPT.alias, 'dashboard');
  assert.equal(DEFAULT_NODE_INSPECTION_SCRIPT.schemaKey, 'default_system');
  assert.equal(typeof DEFAULT_NODE_INSPECTION_SCRIPT.content, 'string');
  assert.equal('id' in DEFAULT_NODE_INSPECTION_SCRIPT, false);

  const { stdout, stderr } = await execFileAsync('sh', ['-c', DEFAULT_NODE_INSPECTION_SCRIPT.content]);
  assert.equal(stderr, '');

  const trimmed = stdout.trim();
  assert.ok(trimmed.startsWith('{'));
  const payload = JSON.parse(trimmed) as Record<string, unknown>;
  assert.equal(payload.schemaVersion, 1);
  assert.equal(typeof payload.collectedAt, 'string');
  assert.equal(typeof payload.system, 'object');
  assert.equal(typeof payload.cpu, 'object');
  assert.equal(typeof payload.memory, 'object');
  assert.equal(typeof payload.disk, 'object');
  assert.equal(typeof payload.load, 'object');
});

void test('default inspection script includes linux cpu sampling logic', async () => {
  const { DEFAULT_NODE_INSPECTION_SCRIPT } = await import('./nodeInspectionScript.js');

  assert.equal(
    DEFAULT_NODE_INSPECTION_SCRIPT.content.includes('read_cpu_stat()'),
    true
  );
  assert.equal(
    DEFAULT_NODE_INSPECTION_SCRIPT.content.includes('/proc/stat'),
    true
  );
  assert.equal(
    DEFAULT_NODE_INSPECTION_SCRIPT.content.includes('sleep 1'),
    true
  );
});

void test('default inspection script computes cpu usage when cpu stats are available', async () => {
  const { DEFAULT_NODE_INSPECTION_SCRIPT } = await import('./nodeInspectionScript.js');

  const fixturePath = path.join(tempRoot, `cpu-stat-fixture-${Date.now()}`);
  const script = DEFAULT_NODE_INSPECTION_SCRIPT.content
    .replace(
      /read_cpu_stat\(\) \{[\s\S]*?\n\}/,
      `
read_cpu_stat() {
  if [ ! -f "$OPSCLAW_CPU_STAT_FIXTURE" ]; then
    printf '%s\\n' '100 0 100 1000 0 0 0 0'
    : > "$OPSCLAW_CPU_STAT_FIXTURE"
  else
    printf '%s\\n' '200 0 100 1100 0 0 0 0'
  fi
}
`.trim()
    )
    .replace('if [ -r /proc/stat ]; then', 'if [ -n "$OPSCLAW_CPU_STAT_FIXTURE" ]; then');

  const { stdout, stderr } = await execFileAsync('sh', ['-c', script], {
    env: {
      ...process.env,
      OPSCLAW_CPU_STAT_FIXTURE: fixturePath,
    },
  });

  assert.equal(stderr, '');
  const payload = JSON.parse(stdout.trim()) as {
    cpu?: {
      usagePercent?: number | null;
    };
  };
  assert.equal(payload.cpu?.usagePercent, 50);
});

void test('listSnapshots returns newest snapshots first', async () => {
  const { createNodeInspectionStore } = await import('./nodeInspectionStore.js');
  const store = await createNodeInspectionStore();

  const first = store.createSnapshot({
    nodeId: 'node-order',
    status: 'success',
    payloadJson: '{"seq":1}',
    errorMessage: null,
  });
  const second = store.createSnapshot({
    nodeId: 'node-order',
    status: 'error',
    payloadJson: null,
    errorMessage: 'boom',
  });

  const snapshots = store.listSnapshots('node-order');
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0]?.id, second.id);
  assert.equal(snapshots[1]?.id, first.id);
  assert.equal(snapshots[0]?.payloadJson, null);
});

void test('createSnapshot keeps only the latest ten snapshots per node', async () => {
  const { createNodeInspectionStore } = await import('./nodeInspectionStore.js');
  const store = await createNodeInspectionStore();

  for (let index = 0; index < 12; index += 1) {
    store.createSnapshot({
      nodeId: 'node-retention',
      status: 'success',
      payloadJson: JSON.stringify({ seq: index }),
      errorMessage: null,
    });
  }

  const snapshots = store.listSnapshots('node-retention');
  assert.equal(snapshots.length, 10);
  assert.equal(snapshots[0]?.payloadJson, '{"seq":11}');
  assert.equal(snapshots[9]?.payloadJson, '{"seq":2}');
  assert.equal(
    snapshots.some((snapshot) => snapshot.payloadJson === '{"seq":0}'),
    false
  );
  assert.equal(
    snapshots.some((snapshot) => snapshot.payloadJson === '{"seq":1}'),
    false
  );
});

void test('getLatestSuccessSnapshot ignores newer failed snapshots', async () => {
  const { createNodeInspectionStore } = await import('./nodeInspectionStore.js');
  const store = await createNodeInspectionStore();

  const success = store.createSnapshot({
    nodeId: 'node-latest-success',
    status: 'success',
    payloadJson: '{"ok":true}',
    errorMessage: null,
  });

  store.createSnapshot({
    nodeId: 'node-latest-success',
    status: 'error',
    payloadJson: null,
    errorMessage: 'command failed',
  });

  const latestSuccess = store.getLatestSuccessSnapshot('node-latest-success');
  assert.deepEqual(latestSuccess, success);
});

void test('deleteNodeInspectionData removes profile and snapshots for a node only', async () => {
  const { createNodeInspectionStore } = await import('./nodeInspectionStore.js');
  const store = await createNodeInspectionStore();

  store.upsertProfile({
    nodeId: 'node-delete-a',
    scriptId: 'script-a',
    dashboardSchemaKey: 'default_system',
  });
  store.createSnapshot({
    nodeId: 'node-delete-a',
    status: 'success',
    payloadJson: '{"node":"a"}',
    errorMessage: null,
  });

  store.upsertProfile({
    nodeId: 'node-delete-b',
    scriptId: 'script-b',
    dashboardSchemaKey: 'default_system',
  });
  const snapshotB = store.createSnapshot({
    nodeId: 'node-delete-b',
    status: 'success',
    payloadJson: '{"node":"b"}',
    errorMessage: null,
  });

  store.deleteNodeInspectionData('node-delete-a');

  assert.equal(store.getProfile('node-delete-a'), null);
  assert.deepEqual(store.listSnapshots('node-delete-a'), []);
  assert.equal(store.getProfile('node-delete-b')?.nodeId, 'node-delete-b');
  assert.deepEqual(store.getLatestSuccessSnapshot('node-delete-b'), snapshotB);
});

void test('legacy profile table is rebuilt without fabricating a scriptId', async () => {
  const { seedSqliteDatabaseFileForTests, getSqliteDatabase } = await import('./database.js');

  await seedSqliteDatabaseFileForTests((database) => {
    database.run(`
      CREATE TABLE node_inspection_profiles (
        node_id TEXT PRIMARY KEY,
        script_key TEXT NOT NULL,
        script_alias TEXT NOT NULL,
        dashboard_schema_key TEXT NOT NULL,
        script_content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database.run(
      `
        INSERT INTO node_inspection_profiles (
          node_id, script_key, script_alias, dashboard_schema_key, script_content, created_at, updated_at
        ) VALUES (
          'node-legacy-profile', 'legacy-dashboard-key', 'dashboard', 'default_system', 'echo old', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        );
      `
    );
  });

  const { createNodeInspectionStore } = await import('./nodeInspectionStore.js');
  const store = await createNodeInspectionStore();
  const sqlite = await getSqliteDatabase();

  assert.equal(store.getProfile('node-legacy-profile'), null);

  const columns = sqlite.database.exec(`PRAGMA table_info(node_inspection_profiles);`)[0]?.values ?? [];
  assert.deepEqual(
    columns.map((row) => row[1]),
    ['node_id', 'script_id', 'dashboard_schema_key', 'created_at', 'updated_at']
  );

  const rows = sqlite.database.exec(`SELECT COUNT(*) AS count FROM node_inspection_profiles;`)[0]?.values ?? [];
  assert.equal(rows[0]?.[0], 0);
});

void test('legacy snapshot table missing required columns is rebuilt to the current structure', async () => {
  const { seedSqliteDatabaseFileForTests, getSqliteDatabase } = await import('./database.js');

  await seedSqliteDatabaseFileForTests((database) => {
    database.run(`
      CREATE TABLE node_inspection_snapshots (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      );
    `);
    database.run(
      `
        INSERT INTO node_inspection_snapshots (
          id, node_id, status, payload_json, error_message, created_at
        ) VALUES (
          'legacy-snapshot-1', 'node-legacy-snapshot', 'success', '{"legacy":true}', NULL, '2026-01-01T00:00:00.000Z'
        );
      `
    );
  });

  const { createNodeInspectionStore } = await import('./nodeInspectionStore.js');
  const store = await createNodeInspectionStore();
  const sqlite = await getSqliteDatabase();

  const created = store.createSnapshot({
    nodeId: 'node-legacy-snapshot',
    status: 'success',
    payloadJson: '{"current":true}',
    errorMessage: null,
  });

  const columns = sqlite.database.exec(`PRAGMA table_info(node_inspection_snapshots);`)[0]?.values ?? [];
  assert.deepEqual(
    columns.map((row) => row[1]),
    ['id', 'node_id', 'status', 'payload_json', 'error_message', 'created_at', 'created_at_ms']
  );
  assert.equal(store.listSnapshots('node-legacy-snapshot').some((item) => item.id === created.id), true);
});
