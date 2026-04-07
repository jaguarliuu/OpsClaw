import assert from 'node:assert/strict';
import test from 'node:test';

import {
  closeOverlayState,
  formatPendingGateIndicatorLabel,
  getPendingGateIndicatorVisible,
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

void test('pending gate indicator is visible when at least one pending ui gate exists', () => {
  assert.equal(getPendingGateIndicatorVisible(0), false);
  assert.equal(getPendingGateIndicatorVisible(1), true);
});

void test('togglePanelOpenState toggles the pending gate panel independently', () => {
  assert.equal(toggleBooleanState(false), true);
  assert.equal(toggleBooleanState(true), false);
});

void test('formatPendingGateIndicatorLabel caps large counts at 99+', () => {
  assert.equal(formatPendingGateIndicatorLabel(1), '1');
  assert.equal(formatPendingGateIndicatorLabel(99), '99');
  assert.equal(formatPendingGateIndicatorLabel(100), '99+');
});
