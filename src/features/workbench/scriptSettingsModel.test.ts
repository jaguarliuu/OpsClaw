import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScriptSettingsEmptyState,
  buildManagedScriptQuery,
  buildScriptSettingsIntro,
} from './scriptSettingsModel.js';

void test('buildManagedScriptQuery maps global and node scope to fetch params', () => {
  assert.deepEqual(
    buildManagedScriptQuery({
      scope: 'global',
      selectedNodeId: '',
    }),
    {
      scope: 'global',
      nodeId: null,
    }
  );

  assert.deepEqual(
    buildManagedScriptQuery({
      scope: 'node',
      selectedNodeId: 'node-1',
    }),
    {
      scope: 'node',
      nodeId: 'node-1',
    }
  );
});

void test('buildScriptSettingsIntro keeps x alias guidance visible in settings', () => {
  assert.match(buildScriptSettingsIntro(), /x alias/);
});

void test('buildScriptSettingsEmptyState explains why node scope cannot load scripts without nodes', () => {
  assert.equal(
    buildScriptSettingsEmptyState({
      scope: 'node',
      hasNodes: false,
      hasQuery: false,
      hasItems: false,
    }),
    '暂无可选节点，请先创建节点后再维护节点脚本。'
  );
});

void test('buildScriptSettingsEmptyState distinguishes empty library from empty search results', () => {
  assert.equal(
    buildScriptSettingsEmptyState({
      scope: 'global',
      hasNodes: true,
      hasQuery: false,
      hasItems: false,
    }),
    '当前范围下还没有脚本。'
  );

  assert.equal(
    buildScriptSettingsEmptyState({
      scope: 'global',
      hasNodes: true,
      hasQuery: true,
      hasItems: false,
    }),
    '没有匹配当前搜索条件的脚本。'
  );
});
