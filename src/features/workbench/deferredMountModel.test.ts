import assert from 'node:assert/strict';
import test from 'node:test';

import { nextDeferredMountState } from './deferredMountModel.js';

void test('nextDeferredMountState stays false before first open', () => {
  assert.equal(nextDeferredMountState(false, false), false);
});

void test('nextDeferredMountState turns true when panel opens for the first time', () => {
  assert.equal(nextDeferredMountState(false, true), true);
});

void test('nextDeferredMountState stays true after the panel has been opened once', () => {
  assert.equal(nextDeferredMountState(true, false), true);
});

void test('nextDeferredMountState keeps the connection panel mounted across reopen cycles', () => {
  const firstClosed = nextDeferredMountState(false, false);
  const firstOpen = nextDeferredMountState(firstClosed, true);
  const secondClosed = nextDeferredMountState(firstOpen, false);
  const secondOpen = nextDeferredMountState(secondClosed, true);

  assert.equal(firstClosed, false);
  assert.equal(firstOpen, true);
  assert.equal(secondClosed, true);
  assert.equal(secondOpen, true);
});
