import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorkbenchLayoutActions,
  buildWorkbenchToolActions,
  getWorkbenchActionClassName,
  performWorkbenchLayoutAction,
  performWorkbenchToolAction,
} from './workbenchHeaderActionsModel.js';

void test('buildWorkbenchToolActions keeps only help and ai actions', () => {
  const actions = buildWorkbenchToolActions({
    isMacShortcutPlatform: true,
  });

  assert.deepEqual(actions, [
    {
      behavior: 'openHelpDialog',
      display: 'label',
      id: 'helpDialog',
      icon: null,
      isActive: false,
      label: '?',
      shortcutLabel: '',
      tone: 'idle',
      title: '帮助与快捷键',
      variant: 'ghost',
    },
    {
      behavior: 'openAiAssistant',
      display: 'icon',
      id: 'aiAssistant',
      icon: 'sparkles',
      isActive: false,
      label: 'AI 助手',
      shortcutLabel: '⌘A',
      tone: 'accent',
      title: 'AI 助手 (⌘A)',
      variant: 'ghost',
    },
  ]);
});

void test('buildWorkbenchToolActions adapts shortcut labels for non-mac platforms', () => {
  const actions = buildWorkbenchToolActions({
    isMacShortcutPlatform: false,
  });

  assert.equal(actions[0]?.title, '帮助与快捷键');
  assert.equal(actions[1]?.shortcutLabel, 'Ctrl+A');
  assert.equal(actions[1]?.tone, 'accent');
  assert.equal(actions[1]?.variant, 'ghost');
});

void test('buildWorkbenchLayoutActions marks the active split layout and carries icon keys', () => {
  assert.deepEqual(buildWorkbenchLayoutActions('single'), [
    {
      behavior: 'exitSplitMode',
      icon: 'single',
      id: 'single',
      isActive: true,
      tone: 'active',
      title: '单屏',
    },
    {
      behavior: 'enterSplitMode',
      icon: 'horizontal',
      id: 'horizontal',
      isActive: false,
      targetLayout: 'horizontal',
      tone: 'idle',
      title: '左右分屏',
    },
    {
      behavior: 'enterSplitMode',
      icon: 'vertical',
      id: 'vertical',
      isActive: false,
      targetLayout: 'vertical',
      tone: 'idle',
      title: '上下分屏',
    },
  ]);

  assert.deepEqual(buildWorkbenchLayoutActions('horizontal').map((item) => item.isActive), [
    false,
    true,
    false,
  ]);
});

void test('performWorkbenchLayoutAction dispatches exit and enter handlers by action behavior', () => {
  const calls: string[] = [];
  const [single, horizontal] = buildWorkbenchLayoutActions('single');

  performWorkbenchLayoutAction(single, {
    onEnterSplitMode(layout) {
      calls.push(`enter:${layout}`);
    },
    onExitSplitMode() {
      calls.push('exit');
    },
  });

  performWorkbenchLayoutAction(horizontal, {
    onEnterSplitMode(layout) {
      calls.push(`enter:${layout}`);
    },
    onExitSplitMode() {
      calls.push('exit');
    },
  });

  assert.deepEqual(calls, ['exit', 'enter:horizontal']);
});

void test('performWorkbenchToolAction dispatches help and ai handlers by action behavior', () => {
  const calls: string[] = [];
  const [helpDialogAction, aiAssistantAction] = buildWorkbenchToolActions({
    isMacShortcutPlatform: true,
  });

  performWorkbenchToolAction(helpDialogAction, {
    onOpenAiAssistant() {
      calls.push('ai');
    },
    onOpenHelpDialog() {
      calls.push('help');
    },
  });

  performWorkbenchToolAction(aiAssistantAction, {
    onOpenAiAssistant() {
      calls.push('ai');
    },
    onOpenHelpDialog() {
      calls.push('help');
    },
  });

  assert.deepEqual(calls, ['help', 'ai']);
});

void test('getWorkbenchActionClassName maps tone to stable utility classes', () => {
  assert.match(getWorkbenchActionClassName('active'), /bg-neutral-700/);
  assert.match(getWorkbenchActionClassName('idle'), /text-neutral-400/);
  assert.match(getWorkbenchActionClassName('accent'), /hover:text-blue-400/);
});
