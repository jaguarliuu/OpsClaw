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
  assert.ok(content.coreFeatures.includes('脚本库：沉淀全局脚本、节点覆盖脚本和脚本别名（alias）。'));
  assert.ok(content.usageTips.includes('脚本支持 alias，终端中输入 x alias 并回车，可快速执行对应脚本。'));
  assert.equal(content.shortcuts.some((item) => item.label === '打开脚本库'), false);
  assert.deepEqual(content.shortcuts.slice(0, 3), [
    { key: '⌘T', label: '新建连接' },
    { key: '⌘A', label: '打开 AI 助手' },
    { key: '⌘R', label: '打开命令历史' },
  ]);
});

void test('buildHelpDialogContent adapts shortcut labels for non-mac platforms', () => {
  const content = buildHelpDialogContent(false);

  assert.equal(content.shortcuts[0]?.key, 'Ctrl+T');
  assert.equal(content.shortcuts[1]?.key, 'Ctrl+A');
  assert.equal(content.shortcuts[2]?.key, 'Ctrl+R');
});
