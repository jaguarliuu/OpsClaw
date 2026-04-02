import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

void test('resolveMainLogFilePath stores desktop main logs under the userData logs directory', async () => {
  const { resolveMainLogFilePath } = await import('./logPaths.js');

  assert.equal(
    resolveMainLogFilePath('/tmp/opsclaw-user-data'),
    path.join('/tmp/opsclaw-user-data', 'logs', 'main.log')
  );
});

void test('resolveBackendLogFilePath stores backend logs under the userData logs directory', async () => {
  const { resolveBackendLogFilePath } = await import('./logPaths.js');

  assert.equal(
    resolveBackendLogFilePath('/tmp/opsclaw-user-data'),
    path.join('/tmp/opsclaw-user-data', 'logs', 'backend.log')
  );
});
