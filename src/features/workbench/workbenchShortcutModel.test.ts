import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWorkbenchShortcutLabel,
  formatUtilityDrawerShortcutLabel,
  resolveWorkbenchShortcutAction,
} from './workbenchShortcutModel.js';

void test('resolveWorkbenchShortcutAction maps mod:semicolon to utility drawer toggle', () => {
  assert.equal(
    resolveWorkbenchShortcutAction({ key: ';', mod: true }),
    'toggleUtilityDrawer'
  );
});

void test('resolveWorkbenchShortcutAction keeps existing quick connect and ai shortcuts', () => {
  assert.equal(
    resolveWorkbenchShortcutAction({ key: 'k', mod: true }),
    'toggleQuickConnect'
  );
  assert.equal(
    resolveWorkbenchShortcutAction({ key: 'a', mod: true }),
    'toggleAiAssistant'
  );
});

void test('formatUtilityDrawerShortcutLabel adapts to platform', () => {
  assert.equal(formatUtilityDrawerShortcutLabel(true), '⌘;');
  assert.equal(formatUtilityDrawerShortcutLabel(false), 'Ctrl+;');
});

void test('formatWorkbenchShortcutLabel supports ai assistant and utility drawer labels', () => {
  assert.equal(formatWorkbenchShortcutLabel('toggleAiAssistant', true), '⌘A');
  assert.equal(formatWorkbenchShortcutLabel('toggleUtilityDrawer', false), 'Ctrl+;');
});
