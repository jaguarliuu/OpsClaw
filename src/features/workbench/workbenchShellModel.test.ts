import assert from 'node:assert/strict';
import test from 'node:test';

import {
  closeOverlayState,
  openOverlayState,
  toggleBooleanState,
} from './workbenchShellModel.js';

void test('toggleBooleanState flips the current boolean value', () => {
  assert.equal(toggleBooleanState(true), false);
  assert.equal(toggleBooleanState(false), true);
});

void test('openOverlayState always returns true', () => {
  assert.equal(openOverlayState(), true);
});

void test('closeOverlayState always returns false', () => {
  assert.equal(closeOverlayState(), false);
});
