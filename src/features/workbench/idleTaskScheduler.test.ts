import assert from 'node:assert/strict';
import test from 'node:test';

import { scheduleIdleTask } from './idleTaskScheduler.js';

void test('scheduleIdleTask prefers requestIdleCallback when available', () => {
  let scheduled = false;
  let cancelledHandle: number | null = null;
  let ran = false;

  const cleanup = scheduleIdleTask(
    {
      requestIdleCallback(callback) {
        scheduled = true;
        callback({ didTimeout: false, timeRemaining: () => 12 } as IdleDeadline);
        return 7;
      },
      cancelIdleCallback(handle) {
        cancelledHandle = handle;
      },
      setTimeout() {
        throw new Error('setTimeout should not be used when requestIdleCallback exists');
      },
      clearTimeout() {
        throw new Error('clearTimeout should not be used when requestIdleCallback exists');
      },
    },
    () => {
      ran = true;
    }
  );

  assert.equal(scheduled, true);
  assert.equal(ran, true);

  cleanup();

  assert.equal(cancelledHandle, 7);
});

void test('scheduleIdleTask falls back to setTimeout when requestIdleCallback is unavailable', () => {
  let scheduledDelay: number | null = null;
  let clearedHandle: unknown = null;
  let ran = false;

  const cleanup = scheduleIdleTask(
    {
      setTimeout(callback: () => void, delay: number) {
        scheduledDelay = delay;
        callback();
        return 11;
      },
      clearTimeout(handle: unknown) {
        clearedHandle = handle;
      },
    },
    () => {
      ran = true;
    }
  );

  assert.equal(scheduledDelay, 1500);
  assert.equal(ran, true);

  cleanup();

  assert.equal(clearedHandle, 11);
});
