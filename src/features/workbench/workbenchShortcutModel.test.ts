import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWorkbenchShortcutLabel,
  resolveWorkbenchShortcutAction,
} from './workbenchShortcutModel.js';

void test('resolveWorkbenchShortcutAction no longer maps mod:semicolon to a script drawer', () => {
  assert.equal(resolveWorkbenchShortcutAction({ key: ';', mod: true }), null);
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

void test('formatWorkbenchShortcutLabel still supports ai assistant labels', () => {
  assert.equal(formatWorkbenchShortcutLabel('toggleAiAssistant', true), '⌘A');
});
