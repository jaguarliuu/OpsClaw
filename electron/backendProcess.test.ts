import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

void test('buildBackendProcessEnv injects port and desktop data directory', async () => {
  const { buildBackendProcessEnv } = await import('./backendProcess.js');

  const env = buildBackendProcessEnv({
    baseEnv: { PATH: '/usr/bin' },
    dataDir: '/tmp/opsclaw-user-data',
    port: 48321,
  });

  assert.equal(env.PORT, '48321');
  assert.equal(env.OPSCLAW_DATA_DIR, '/tmp/opsclaw-user-data');
  assert.equal(env.OPSCLAW_DESKTOP, '1');
  assert.equal(env.PATH, '/usr/bin');
});

void test('buildBackendRuntimeConfig derives renderer endpoints from the chosen local port', async () => {
  const { buildBackendRuntimeConfig } = await import('./backendProcess.js');

  assert.deepEqual(buildBackendRuntimeConfig({ port: 48321 }), {
    desktop: true,
    serverHttpBaseUrl: 'http://127.0.0.1:48321',
    serverWebSocketBaseUrl: 'ws://127.0.0.1:48321',
  });
});

void test('resolveBackendEntryPath uses app.asar in packaged builds so the backend can resolve bundled dependencies', async () => {
  const { resolveBackendEntryPath } = await import('./backendProcess.js');

  assert.equal(
    resolveBackendEntryPath({
      cwd: '/workspace/opsclaw',
      isPackaged: true,
      resourcesPath: '/bundle/resources',
    }),
    path.join('/bundle/resources', 'app.asar', 'dist-server', 'server', 'index.js')
  );
});

void test('resolveRendererIndexHtmlPath uses app.asar in packaged builds so the renderer can load bundled assets', async () => {
  const { resolveRendererIndexHtmlPath } = await import('./backendProcess.js');

  assert.equal(
    resolveRendererIndexHtmlPath('/bundle/resources'),
    path.join('/bundle/resources', 'app.asar', 'dist', 'index.html')
  );
});
