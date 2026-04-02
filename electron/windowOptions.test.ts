import assert from 'node:assert/strict';
import test from 'node:test';

void test('buildMainWindowOptions removes the default Windows title bar chrome in packaged desktop builds', async () => {
  const { buildMainWindowOptions } = await import('./windowOptions.js');

  const options = buildMainWindowOptions({
    platform: 'win32',
    preloadPath: '/tmp/preload.js',
    runtimeArgument: 'runtime-arg',
  });

  assert.equal(options.autoHideMenuBar, true);
  assert.equal(options.titleBarStyle, 'hidden');
  assert.deepEqual(options.titleBarOverlay, {
    color: '#0a0a0a',
    symbolColor: '#f5f5f5',
    height: 36,
  });
});

void test('buildMainWindowOptions keeps non-Windows platforms on the standard window style', async () => {
  const { buildMainWindowOptions } = await import('./windowOptions.js');

  const options = buildMainWindowOptions({
    platform: 'darwin',
    preloadPath: '/tmp/preload.js',
    runtimeArgument: 'runtime-arg',
  });

  assert.equal(options.titleBarStyle, undefined);
  assert.equal(options.titleBarOverlay, undefined);
});
