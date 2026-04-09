import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSettingsPath,
  isSettingsPageTab,
  resolveSettingsTab,
  type SettingsPageTab,
} from './settingsNavigation.js';

void test('buildSettingsPath builds a stable settings route for a target tab', () => {
  assert.equal(buildSettingsPath(), '/settings');
  assert.equal(buildSettingsPath('llm'), '/settings?tab=llm');
  assert.equal(buildSettingsPath('memory'), '/settings?tab=memory');
  assert.equal(buildSettingsPath('scripts'), '/settings?tab=scripts');
});

void test('resolveSettingsTab returns a supported tab and falls back to terminal', () => {
  assert.equal(resolveSettingsTab(new URLSearchParams()), 'terminal');
  assert.equal(resolveSettingsTab(new URLSearchParams('tab=llm')), 'llm');
  assert.equal(resolveSettingsTab(new URLSearchParams('tab=memory')), 'memory');
  assert.equal(resolveSettingsTab(new URLSearchParams('tab=scripts')), 'scripts');
  assert.equal(
    resolveSettingsTab(new URLSearchParams('tab=unknown' as SettingsPageTab)),
    'terminal'
  );
});

void test('isSettingsPageTab only accepts supported settings tabs', () => {
  assert.equal(isSettingsPageTab('terminal'), true);
  assert.equal(isSettingsPageTab('scripts'), true);
  assert.equal(isSettingsPageTab('unknown'), false);
});
