import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

void test('resolveOpsClawDataDir prefers OPSCLAW_DATA_DIR over cwd fallback', async () => {
  const { resolveOpsClawDataDir } = await import('./runtimePaths.js');

  assert.equal(
    resolveOpsClawDataDir({
      cwd: '/tmp/project',
      env: { OPSCLAW_DATA_DIR: '/tmp/custom-data' },
    }),
    '/tmp/custom-data'
  );
});

void test('resolveOpsClawDataDir falls back to cwd when no runtime override exists', async () => {
  const { resolveOpsClawDataDir } = await import('./runtimePaths.js');

  assert.equal(
    resolveOpsClawDataDir({
      cwd: '/tmp/project',
      env: {},
    }),
    '/tmp/project'
  );
});

void test('resolveDatabaseFilePath nests sqlite under the chosen data directory', async () => {
  const { resolveDatabaseFilePath } = await import('./runtimePaths.js');

  assert.equal(
    resolveDatabaseFilePath('/tmp/opsclaw-user-data'),
    path.join('/tmp/opsclaw-user-data', 'data', 'opsclaw.sqlite')
  );
});

void test('resolveSecretKeyFilePath uses the shared runtime data directory', async () => {
  const { resolveSecretKeyFilePath } = await import('./runtimePaths.js');

  assert.equal(
    resolveSecretKeyFilePath('/tmp/opsclaw-user-data'),
    path.join('/tmp/opsclaw-user-data', 'data', 'opsclaw.master.key')
  );
});

void test('resolveMemoryRootDir uses the shared runtime data directory', async () => {
  const { resolveMemoryRootDir } = await import('./runtimePaths.js');

  assert.equal(
    resolveMemoryRootDir('/tmp/opsclaw-user-data'),
    path.join('/tmp/opsclaw-user-data', 'data', 'memory')
  );
});
