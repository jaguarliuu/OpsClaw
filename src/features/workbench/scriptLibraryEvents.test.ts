import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isScriptLibraryChangeRelevant,
  type ScriptLibraryChangedDetail,
} from './scriptLibraryEvents.js';

void test('isScriptLibraryChangeRelevant refreshes all terminal quick scripts when a global script changes', () => {
  const detail: ScriptLibraryChangedDetail = {
    nodeId: null,
  };

  assert.equal(isScriptLibraryChangeRelevant(detail, null), true);
  assert.equal(isScriptLibraryChangeRelevant(detail, 'node-1'), true);
});

void test('isScriptLibraryChangeRelevant refreshes node quick scripts only for the affected node', () => {
  const detail: ScriptLibraryChangedDetail = {
    nodeId: 'node-1',
  };

  assert.equal(isScriptLibraryChangeRelevant(detail, 'node-1'), true);
  assert.equal(isScriptLibraryChangeRelevant(detail, 'node-2'), false);
  assert.equal(isScriptLibraryChangeRelevant(detail, null), false);
});
