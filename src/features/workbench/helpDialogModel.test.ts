import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHelpDialogContent } from './helpDialogModel.js';

void test('buildHelpDialogContent returns app intro, feature bullets, tips, and platform-aware shortcuts', () => {
  const content = buildHelpDialogContent(true);

  assert.equal(content.title, '帮助与快捷键');
  assert.match(content.description, /OpsClaw/);
  assert.ok(content.introduction.length >= 2);
  assert.ok(content.coreFeatures.length >= 4);
  assert.ok(content.usageTips.length >= 3);
  assert.deepEqual(content.shortcuts.slice(0, 3), [
    { key: '⌘T', label: '新建连接' },
    { key: '⌘A', label: '打开 AI 助手' },
    { key: '⌘;', label: '打开脚本库' },
  ]);
});

void test('buildHelpDialogContent adapts shortcut labels for non-mac platforms', () => {
  const content = buildHelpDialogContent(false);

  assert.equal(content.shortcuts[0]?.key, 'Ctrl+T');
  assert.equal(content.shortcuts[1]?.key, 'Ctrl+A');
  assert.equal(content.shortcuts[2]?.key, 'Ctrl+;');
});
