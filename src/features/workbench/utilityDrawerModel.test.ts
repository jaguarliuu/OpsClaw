import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getWorkbenchContentGridClassName,
  nextUtilityDrawerOpenState,
} from './utilityDrawerModel.js';

void test('nextUtilityDrawerOpenState closes and reopens the drawer explicitly', () => {
  assert.equal(nextUtilityDrawerOpenState(true, 'close'), false);
  assert.equal(nextUtilityDrawerOpenState(false, 'open'), true);
  assert.equal(nextUtilityDrawerOpenState(true, 'toggle'), false);
  assert.equal(nextUtilityDrawerOpenState(false, 'toggle'), true);
});

void test('getWorkbenchContentGridClassName removes the drawer column when closed', () => {
  assert.equal(
    getWorkbenchContentGridClassName(true),
    'grid min-w-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]'
  );
  assert.equal(
    getWorkbenchContentGridClassName(false),
    'grid min-w-0 flex-1 grid-cols-1'
  );
});
