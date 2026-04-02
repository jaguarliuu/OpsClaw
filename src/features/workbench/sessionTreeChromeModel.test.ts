import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SESSION_TREE_GRID_ROWS_CLASS,
  buildSessionTreeSearchState,
  shouldShowFilterClearButton,
} from './sessionTreeChromeModel.js';

void test('SESSION_TREE_GRID_ROWS_CLASS reserves separate rows for header, search, content, and footer', () => {
  assert.equal(SESSION_TREE_GRID_ROWS_CLASS, 'grid-rows-[auto_auto_1fr_auto]');
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
