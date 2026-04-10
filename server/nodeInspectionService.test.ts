import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DEFAULT_NODE_INSPECTION_SCRIPT } from './nodeInspectionScript.js';

const originalCwd = process.cwd();

let tempRoot = '';

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opsclaw-node-inspection-service-'));
  process.chdir(tempRoot);
  process.env.OPSCLAW_MASTER_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
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

function createFakeNodeStore() {
  const nodeSummary = {
    id: 'node-1',
    name: 'Prod A',
    groupId: null,
    groupName: '默认',
    jumpHostId: null,
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    authMode: 'password' as const,
    note: '',
    createdAt: '2026-04-09T10:00:00.000Z',
    updatedAt: '2026-04-09T10:00:00.000Z',
  };

  return {
    getNode(id: string) {
      return id === nodeSummary.id
        ? {
            ...nodeSummary,
            password: null,
            privateKey: null,
            passphrase: null,
            hasPassword: true,
            hasPrivateKey: false,
            hasPassphrase: false,
          }
        : null;
    },
    getNodeWithSecrets(id: string) {
      return id === nodeSummary.id
        ? {
            ...nodeSummary,
            password: 'secret',
            privateKey: null,
            passphrase: null,
          }
        : null;
    },
  };
}

void test('ensureNodeBootstrap creates a node inspection profile backed by an inspection script', async () => {
  const [{ createNodeInspectionStore }, { createScriptLibraryStore }, { createNodeInspectionService }] =
    await Promise.all([
      import('./nodeInspectionStore.js'),
      import('./scriptLibraryStore.js'),
      import('./nodeInspectionService.js'),
    ]);
  const inspectionStore = await createNodeInspectionStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const service = createNodeInspectionService({
    nodeStore: createFakeNodeStore() as never,
    scriptLibraryStore,
    inspectionStore,
    runInspectionCommand: async () => {
      throw new Error('not used');
    },
  });

  const profile = service.ensureNodeBootstrap('node-1');
  const script = scriptLibraryStore.getScript(profile.scriptId);

  assert.equal(profile.nodeId, 'node-1');
  assert.equal(profile.dashboardSchemaKey, DEFAULT_NODE_INSPECTION_SCRIPT.schemaKey);
  assert.equal(script?.usage, 'inspection');
  assert.equal(script?.scope, 'node');
  assert.equal(script?.nodeId, 'node-1');
  assert.equal(script?.alias, DEFAULT_NODE_INSPECTION_SCRIPT.alias);
});

void test('collectNodeDashboard works without an existing terminal session', async () => {
  const [{ createNodeInspectionStore }, { createScriptLibraryStore }, { createNodeInspectionService }] =
    await Promise.all([
      import('./nodeInspectionStore.js'),
      import('./scriptLibraryStore.js'),
      import('./nodeInspectionService.js'),
    ]);
  const inspectionStore = await createNodeInspectionStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const service = createNodeInspectionService({
    nodeStore: createFakeNodeStore() as never,
    scriptLibraryStore,
    inspectionStore,
    runInspectionCommand: async () =>
      JSON.stringify({
        schemaVersion: 1,
        collectedAt: '2026-04-09T10:00:00.000Z',
        cpu: { usagePercent: 42 },
      }),
  });

  const result = await service.collectNodeDashboard('node-1');

  assert.equal(result.profile?.nodeId, 'node-1');
  assert.equal(result.latestSnapshot?.status, 'success');
  assert.equal(result.latestSnapshot?.payloadJson, '{"schemaVersion":1,"collectedAt":"2026-04-09T10:00:00.000Z","cpu":{"usagePercent":42}}');
  assert.equal(result.latestSnapshot?.summaryJson?.cpuUsagePercent, 42);
  assert.equal(result.latestSuccessSnapshot?.status, 'success');
  assert.equal(result.recentSnapshots.length, 1);
});

void test('collectNodeDashboard writes an error snapshot and preserves latest success lookup', async () => {
  const [{ createNodeInspectionStore }, { createScriptLibraryStore }, { createNodeInspectionService }] =
    await Promise.all([
      import('./nodeInspectionStore.js'),
      import('./scriptLibraryStore.js'),
      import('./nodeInspectionService.js'),
    ]);
  const inspectionStore = await createNodeInspectionStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  let runCount = 0;
  const service = createNodeInspectionService({
    nodeStore: createFakeNodeStore() as never,
    scriptLibraryStore,
    inspectionStore,
    runInspectionCommand: async () => {
      runCount += 1;
      if (runCount === 1) {
        return JSON.stringify({
          schemaVersion: 1,
          collectedAt: '2026-04-09T10:00:00.000Z',
          cpu: { usagePercent: 42 },
        });
      }

      throw new Error('ssh command failed');
    },
  });

  await service.collectNodeDashboard('node-1');
  const result = await service.collectNodeDashboard('node-1');

  assert.equal(result.latestSnapshot?.status, 'error');
  assert.equal(result.latestSnapshot?.payloadJson, null);
  assert.match(result.latestSnapshot?.errorMessage ?? '', /ssh command failed/);
  assert.equal(result.latestSuccessSnapshot?.status, 'success');
  assert.equal(result.latestSuccessSnapshot?.summaryJson?.cpuUsagePercent, 42);
  assert.equal(result.recentSnapshots.length, 2);
  assert.equal(result.recentSnapshots[0]?.status, 'error');
});

void test('deleteNodeInspectionData removes node scoped inspection scripts together with profile and snapshots', async () => {
  const [{ createNodeInspectionStore }, { createScriptLibraryStore }, { createNodeInspectionService }] =
    await Promise.all([
      import('./nodeInspectionStore.js'),
      import('./scriptLibraryStore.js'),
      import('./nodeInspectionService.js'),
    ]);
  const inspectionStore = await createNodeInspectionStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const service = createNodeInspectionService({
    nodeStore: createFakeNodeStore() as never,
    scriptLibraryStore,
    inspectionStore,
    runInspectionCommand: async () => JSON.stringify({ schemaVersion: 1 }),
  });

  const profile = service.ensureNodeBootstrap('node-1');
  inspectionStore.createSnapshot({
    nodeId: 'node-1',
    status: 'success',
    payloadJson: '{"schemaVersion":1}',
    errorMessage: null,
  });

  service.deleteNodeInspectionData('node-1');

  assert.equal(inspectionStore.getProfile('node-1'), null);
  assert.deepEqual(inspectionStore.listSnapshots('node-1'), []);
  assert.equal(scriptLibraryStore.getScript(profile.scriptId), null);
  assert.deepEqual(
    scriptLibraryStore.listManagedScripts({
      scope: 'node',
      nodeId: 'node-1',
      usage: 'inspection',
    }),
    []
  );
});

void test('ensureDefaultInspectionProfile recreates the default script when the bound script is missing', async () => {
  const [{ createNodeInspectionStore }, { createScriptLibraryStore }, { createNodeInspectionService }] =
    await Promise.all([
      import('./nodeInspectionStore.js'),
      import('./scriptLibraryStore.js'),
      import('./nodeInspectionService.js'),
    ]);
  const inspectionStore = await createNodeInspectionStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const service = createNodeInspectionService({
    nodeStore: createFakeNodeStore() as never,
    scriptLibraryStore,
    inspectionStore,
    runInspectionCommand: async () => JSON.stringify({ schemaVersion: 1 }),
  });

  const originalProfile = service.ensureNodeBootstrap('node-1');
  const alternateScript = scriptLibraryStore.createScript({
    key: 'alt-inspection',
    alias: 'alt-inspection',
    scope: 'node',
    nodeId: 'node-1',
    title: '备用巡检',
    description: '',
    kind: 'plain',
    usage: 'inspection',
    content: 'echo alt',
    variables: [],
    tags: [],
  });
  scriptLibraryStore.deleteScript(originalProfile.scriptId);

  const rebuiltProfile = service.ensureDefaultInspectionProfile('node-1');
  const rebuiltScript = scriptLibraryStore.getScript(rebuiltProfile.scriptId);

  assert.notEqual(rebuiltProfile.scriptId, alternateScript.id);
  assert.notEqual(rebuiltProfile.scriptId, originalProfile.scriptId);
  assert.equal(rebuiltScript?.key, DEFAULT_NODE_INSPECTION_SCRIPT.key);
  assert.equal(rebuiltScript?.alias, DEFAULT_NODE_INSPECTION_SCRIPT.alias);
  assert.equal(rebuiltScript?.usage, 'inspection');
});

void test('ensureDefaultInspectionProfile upgrades the legacy placeholder dashboard script content', async () => {
  const [{ createNodeInspectionStore }, { createScriptLibraryStore }, { createNodeInspectionService }] =
    await Promise.all([
      import('./nodeInspectionStore.js'),
      import('./scriptLibraryStore.js'),
      import('./nodeInspectionService.js'),
    ]);
  const inspectionStore = await createNodeInspectionStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const legacyScript = scriptLibraryStore.createScript({
    key: DEFAULT_NODE_INSPECTION_SCRIPT.key,
    alias: DEFAULT_NODE_INSPECTION_SCRIPT.alias,
    scope: 'node',
    nodeId: 'node-1',
    title: '节点默认巡检',
    description: '',
    kind: 'plain',
    usage: 'inspection',
    content: `printf '%s\n' '{"status":"ok"}'`,
    variables: [],
    tags: ['dashboard', 'inspection'],
  });
  inspectionStore.upsertProfile({
    nodeId: 'node-1',
    scriptId: legacyScript.id,
    dashboardSchemaKey: DEFAULT_NODE_INSPECTION_SCRIPT.schemaKey,
  });

  const service = createNodeInspectionService({
    nodeStore: createFakeNodeStore() as never,
    scriptLibraryStore,
    inspectionStore,
    runInspectionCommand: async () => JSON.stringify({ schemaVersion: 1 }),
  });

  const profile = service.ensureDefaultInspectionProfile('node-1');
  const upgradedScript = scriptLibraryStore.getScript(profile.scriptId);

  assert.equal(profile.scriptId, legacyScript.id);
  assert.notEqual(upgradedScript?.content, legacyScript.content);
  assert.equal(upgradedScript?.content, DEFAULT_NODE_INSPECTION_SCRIPT.content);
});

void test('ensureDefaultInspectionProfile upgrades the escaped broken default dashboard script content', async () => {
  const [{ createNodeInspectionStore }, { createScriptLibraryStore }, { createNodeInspectionService }] =
    await Promise.all([
      import('./nodeInspectionStore.js'),
      import('./scriptLibraryStore.js'),
      import('./nodeInspectionService.js'),
    ]);
  const inspectionStore = await createNodeInspectionStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const brokenScript = scriptLibraryStore.createScript({
    key: DEFAULT_NODE_INSPECTION_SCRIPT.key,
    alias: DEFAULT_NODE_INSPECTION_SCRIPT.alias,
    scope: 'node',
    nodeId: 'node-1',
    title: '节点默认巡检',
    description: '',
    kind: 'plain',
    usage: 'inspection',
    content: `
json_escape() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
}

read_first_line() {
  awk 'NF { print; exit }'
}

MEMORY_USAGE_PERCENT="$(awk 'BEGIN { printf \\"%.1f\\", 1 }')"
DISK_DF_LINE="$(df -P -k / 2>/dev/null | awk 'NR==2 {print $2\\" \\"$3\\" \\"$5; exit}')"
printf '"schemaVersion":1'
`.trim(),
    variables: [],
    tags: ['dashboard', 'inspection'],
  });
  inspectionStore.upsertProfile({
    nodeId: 'node-1',
    scriptId: brokenScript.id,
    dashboardSchemaKey: DEFAULT_NODE_INSPECTION_SCRIPT.schemaKey,
  });

  const service = createNodeInspectionService({
    nodeStore: createFakeNodeStore() as never,
    scriptLibraryStore,
    inspectionStore,
    runInspectionCommand: async () => JSON.stringify({ schemaVersion: 1 }),
  });

  const profile = service.ensureDefaultInspectionProfile('node-1');
  const upgradedScript = scriptLibraryStore.getScript(profile.scriptId);

  assert.equal(profile.scriptId, brokenScript.id);
  assert.notEqual(upgradedScript?.content, brokenScript.content);
  assert.equal(upgradedScript?.content, DEFAULT_NODE_INSPECTION_SCRIPT.content);
});

void test('ensureDefaultInspectionProfile upgrades the previous default dashboard script that always reports null cpu usage', async () => {
  const [{ createNodeInspectionStore }, { createScriptLibraryStore }, { createNodeInspectionService }] =
    await Promise.all([
      import('./nodeInspectionStore.js'),
      import('./scriptLibraryStore.js'),
      import('./nodeInspectionService.js'),
    ]);
  const inspectionStore = await createNodeInspectionStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const oldDefaultScript = scriptLibraryStore.createScript({
    key: DEFAULT_NODE_INSPECTION_SCRIPT.key,
    alias: DEFAULT_NODE_INSPECTION_SCRIPT.alias,
    scope: 'node',
    nodeId: 'node-1',
    title: '节点默认巡检',
    description: '',
    kind: 'plain',
    usage: 'inspection',
    content: `
json_escape() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
}

read_first_line() {
  awk 'NF { print; exit }'
}

COLLECTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")"
HOSTNAME_VALUE="$(hostname 2>/dev/null | read_first_line)"
PLATFORM_VALUE="$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' | read_first_line)"
KERNEL_VALUE="$(uname -r 2>/dev/null | read_first_line)"

CPU_MODEL="$(awk -F: '/model name/ {gsub(/^[ \\t]+/, "", $2); print $2; exit }' /proc/cpuinfo 2>/dev/null | read_first_line)"
CPU_CORES="$(getconf _NPROCESSORS_ONLN 2>/dev/null | read_first_line)"
CPU_CORES="\${CPU_CORES:-null}"
CPU_USAGE_PERCENT="null"

MEMORY_TOTAL_BYTES="null"
if [ -r /proc/meminfo ]; then
  MEMORY_TOTAL_KB="$(awk '/MemTotal:/ {print $2; exit}' /proc/meminfo 2>/dev/null)"
  MEMORY_AVAILABLE_KB="$(awk '/MemAvailable:/ {print $2; exit}' /proc/meminfo 2>/dev/null)"
  if [ -n "$MEMORY_TOTAL_KB" ] && [ -n "$MEMORY_AVAILABLE_KB" ]; then
    MEMORY_TOTAL_BYTES="$((MEMORY_TOTAL_KB * 1024))"
  fi
fi

printf '{'
printf '"schemaVersion":1,'
printf '"cpu":{"model":"%s","cores":%s,"usagePercent":%s},' "$(json_escape "\${CPU_MODEL:-unknown}")" "\${CPU_CORES:-null}" "\${CPU_USAGE_PERCENT:-null}"
printf '"memory":{"totalBytes":%s},' "\${MEMORY_TOTAL_BYTES:-null}"
printf '"services":[]'
printf '}\\n'
`.trim(),
    variables: [],
    tags: ['dashboard', 'inspection'],
  });
  inspectionStore.upsertProfile({
    nodeId: 'node-1',
    scriptId: oldDefaultScript.id,
    dashboardSchemaKey: DEFAULT_NODE_INSPECTION_SCRIPT.schemaKey,
  });

  const service = createNodeInspectionService({
    nodeStore: createFakeNodeStore() as never,
    scriptLibraryStore,
    inspectionStore,
    runInspectionCommand: async () => JSON.stringify({ schemaVersion: 1 }),
  });

  const profile = service.ensureDefaultInspectionProfile('node-1');
  const upgradedScript = scriptLibraryStore.getScript(profile.scriptId);

  assert.equal(profile.scriptId, oldDefaultScript.id);
  assert.notEqual(upgradedScript?.content, oldDefaultScript.content);
  assert.equal(upgradedScript?.content, DEFAULT_NODE_INSPECTION_SCRIPT.content);
});

void test('ensureDefaultInspectionProfile upgrades the previous default dashboard script with incompatible cpu awk syntax', async () => {
  const [{ createNodeInspectionStore }, { createScriptLibraryStore }, { createNodeInspectionService }] =
    await Promise.all([
      import('./nodeInspectionStore.js'),
      import('./scriptLibraryStore.js'),
      import('./nodeInspectionService.js'),
    ]);
  const inspectionStore = await createNodeInspectionStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const previousDefaultScript = scriptLibraryStore.createScript({
    key: DEFAULT_NODE_INSPECTION_SCRIPT.key,
    alias: DEFAULT_NODE_INSPECTION_SCRIPT.alias,
    scope: 'node',
    nodeId: 'node-1',
    title: '节点默认巡检',
    description: '',
    kind: 'plain',
    usage: 'inspection',
    content: `
json_escape() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
}

read_first_line() {
  awk 'NF { print; exit }'
}

read_cpu_stat() {
  awk '/^cpu / {print $2" "$3" "$4" "$5" "$6" "$7" "$8" "$9; exit }' /proc/stat 2>/dev/null
}

CPU_USAGE_PERCENT="$(awk -v first="1 2 3 4 5 6 7 8" -v second="2 3 4 5 6 7 8 9" '
function sum_fields(value, parts,    total, index) {
  split(value, parts, " ")
  total = 0
  for (index = 1; index <= 8; index += 1) {
    total += parts[index] + 0
  }
  return total
}
function idle_fields(value, parts) {
  split(value, parts, " ")
  return (parts[4] + 0) + (parts[5] + 0)
}
BEGIN {
  total_1 = sum_fields(first, fields_1)
  total_2 = sum_fields(second, fields_2)
  idle_1 = idle_fields(first, idle_parts_1)
  idle_2 = idle_fields(second, idle_parts_2)
  total_delta = total_2 - total_1
  idle_delta = idle_2 - idle_1
  if (total_delta > 0) {
    printf "%.1f", (1 - idle_delta / total_delta) * 100
  } else {
    printf "null"
  }
}')"

printf '{"schemaVersion":1}\\n'
`.trim(),
    variables: [],
    tags: ['dashboard', 'inspection'],
  });
  inspectionStore.upsertProfile({
    nodeId: 'node-1',
    scriptId: previousDefaultScript.id,
    dashboardSchemaKey: DEFAULT_NODE_INSPECTION_SCRIPT.schemaKey,
  });

  const service = createNodeInspectionService({
    nodeStore: createFakeNodeStore() as never,
    scriptLibraryStore,
    inspectionStore,
    runInspectionCommand: async () => JSON.stringify({ schemaVersion: 1 }),
  });

  const profile = service.ensureDefaultInspectionProfile('node-1');
  const upgradedScript = scriptLibraryStore.getScript(profile.scriptId);

  assert.equal(profile.scriptId, previousDefaultScript.id);
  assert.notEqual(upgradedScript?.content, previousDefaultScript.content);
  assert.equal(upgradedScript?.content, DEFAULT_NODE_INSPECTION_SCRIPT.content);
});
