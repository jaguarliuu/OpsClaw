import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_AGENT_MAX_STEPS,
  loadAgentMaxSteps,
  normalizeAgentMaxSteps,
  saveAgentMaxSteps,
} from './agentRunSettings.js';

type StorageStub = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

void test('normalizeAgentMaxSteps accepts supported values and falls back for unsupported values', () => {
  assert.equal(DEFAULT_AGENT_MAX_STEPS, 24);
  assert.equal(normalizeAgentMaxSteps(30), 30);
  assert.equal(normalizeAgentMaxSteps(40), 40);
  assert.equal(normalizeAgentMaxSteps(999), DEFAULT_AGENT_MAX_STEPS);
  assert.equal(normalizeAgentMaxSteps(Number.NaN), DEFAULT_AGENT_MAX_STEPS);
});

void test('loadAgentMaxSteps reads the persisted value and falls back on invalid storage content', () => {
  const validStorage: StorageStub = {
    getItem() {
      return '40';
    },
    setItem() {},
  };

  const invalidStorage: StorageStub = {
    getItem() {
      return 'not-a-number';
    },
    setItem() {},
  };

  assert.equal(loadAgentMaxSteps(validStorage), 40);
  assert.equal(loadAgentMaxSteps(invalidStorage), DEFAULT_AGENT_MAX_STEPS);
  assert.equal(loadAgentMaxSteps(undefined), DEFAULT_AGENT_MAX_STEPS);
});

void test('saveAgentMaxSteps persists the normalized value', () => {
  const writes: Array<{ key: string; value: string }> = [];
  const storage: StorageStub = {
    getItem() {
      return null;
    },
    setItem(key, value) {
      writes.push({ key, value });
    },
  };

  saveAgentMaxSteps(999, storage);

  assert.deepEqual(writes, [
    {
      key: 'opsclaw.agent.maxSteps',
      value: '24',
    },
  ]);
});
