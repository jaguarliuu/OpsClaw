import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

void test('resolveElectronModuleDir derives the module directory from import meta url', async () => {
  const { resolveElectronModuleDir } = await import('./mainRuntimePaths.js');

  assert.equal(
    resolveElectronModuleDir('file:///bundle/dist-electron/electron/main.js'),
    path.join('/bundle', 'dist-electron', 'electron')
  );
});

void test('resolvePreloadPath builds preload.js beside the compiled main module', async () => {
  const { resolvePreloadPath } = await import('./mainRuntimePaths.js');

  assert.equal(
    resolvePreloadPath('file:///bundle/dist-electron/electron/main.js'),
    path.join('/bundle', 'dist-electron', 'electron', 'preload.js')
  );
});
