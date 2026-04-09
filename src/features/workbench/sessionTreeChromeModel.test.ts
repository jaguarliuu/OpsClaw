import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SESSION_TREE_TITLE,
  SESSION_TREE_GRID_ROWS_CLASS,
  buildSessionTreeFooterActions,
  buildSessionTreeSearchState,
  shouldShowFilterClearButton,
} from './sessionTreeChromeModel.js';

void test('SESSION_TREE_GRID_ROWS_CLASS reserves separate rows for header, search, content, and footer', () => {
  assert.equal(SESSION_TREE_GRID_ROWS_CLASS, 'grid-rows-[auto_auto_1fr_auto]');
});

void test('SESSION_TREE_TITLE brands the sidebar header as OpsClaw', () => {
  assert.equal(SESSION_TREE_TITLE, 'OpsClaw');
});

void test('shouldShowFilterClearButton returns false for an empty query', () => {
  assert.equal(shouldShowFilterClearButton(''), false);
});

void test('shouldShowFilterClearButton returns true when the query has content', () => {
  assert.equal(shouldShowFilterClearButton('alpha'), true);
});

void test('buildSessionTreeSearchState derives the clear button visibility from the query', () => {
  assert.deepEqual(buildSessionTreeSearchState(''), {
    showClearButton: false,
  });
  assert.deepEqual(buildSessionTreeSearchState('node-1'), {
    showClearButton: true,
  });
});

void test('buildSessionTreeFooterActions keeps sidebar actions in bottom-safe order', () => {
  assert.deepEqual(buildSessionTreeFooterActions(), [
    { id: 'new-connection', label: '新建连接' },
    { id: 'open-scripts', label: '脚本' },
    { id: 'open-settings', label: '设置' },
    { id: 'collapse-sidebar', label: '收起侧栏' },
  ]);
});
