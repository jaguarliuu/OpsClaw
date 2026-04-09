import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkbenchShellRouteState } from './workbenchShellRouteModel.js';

void test('root route keeps the workbench shell mounted without overlays', () => {
  assert.deepEqual(buildWorkbenchShellRouteState('/'), {
    keepWorkbenchMounted: true,
    showSettingsOverlay: false,
  });
});

void test('settings route keeps the workbench shell mounted and opens the settings overlay', () => {
  assert.deepEqual(buildWorkbenchShellRouteState('/settings'), {
    keepWorkbenchMounted: true,
    showSettingsOverlay: true,
  });
});

void test('non-workbench routes do not keep the workbench shell mounted', () => {
  assert.deepEqual(buildWorkbenchShellRouteState('/audit'), {
    keepWorkbenchMounted: false,
    showSettingsOverlay: false,
  });
});
