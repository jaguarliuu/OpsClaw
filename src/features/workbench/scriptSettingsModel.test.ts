import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScriptSettingsEmptyState,
  buildManagedScriptQuery,
  buildScriptSettingsIntro,
  normalizeTemplateVariableDefinitions,
  validateTemplateScriptDefinition,
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

  assert.deepEqual(
    buildManagedScriptQuery({
      scope: 'node',
      selectedNodeId: '',
    }),
    {
      scope: 'node',
      nodeId: null,
    }
  );

  assert.deepEqual(
    buildManagedScriptQuery({
      scope: 'node',
      selectedNodeId: '   ',
    }),
    {
      scope: 'node',
      nodeId: null,
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

void test('validateTemplateScriptDefinition rejects blank and duplicate variable names', () => {
  const blankResult = validateTemplateScriptDefinition('echo ${service}', [
    {
      name: ' ',
      label: '服务名',
      inputType: 'text',
      required: true,
      defaultValue: '',
      placeholder: '',
    },
  ]);

  assert.equal(blankResult.ok, false);
  assert.match(blankResult.message ?? '', /变量名不能为空/);

  const duplicateResult = validateTemplateScriptDefinition('echo ${service}', [
    {
      name: 'service',
      label: '服务名',
      inputType: 'text',
      required: true,
      defaultValue: '',
      placeholder: '',
    },
    {
      name: 'service',
      label: '服务名',
      inputType: 'text',
      required: false,
      defaultValue: '',
      placeholder: '',
    },
  ]);

  assert.equal(duplicateResult.ok, false);
  assert.match(duplicateResult.message ?? '', /不能重复/);
});

void test('validateTemplateScriptDefinition rejects missing placeholder definitions', () => {
  const missingResult = validateTemplateScriptDefinition('echo ${service} && echo ${region}', [
    {
      name: 'service',
      label: '服务名',
      inputType: 'text',
      required: true,
      defaultValue: '',
      placeholder: '',
    },
  ]);

  assert.equal(missingResult.ok, false);
  assert.match(missingResult.message ?? '', /缺少变量定义/);
});

void test('validateTemplateScriptDefinition allows extra variable definitions to match server behavior', () => {
  const result = validateTemplateScriptDefinition('echo ${service}', [
    {
      name: 'service',
      label: '服务名',
      inputType: 'text',
      required: true,
      defaultValue: '',
      placeholder: '',
    },
    {
      name: 'region',
      label: '区域',
      inputType: 'text',
      required: false,
      defaultValue: '',
      placeholder: '',
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.message, null);
});

void test('validateTemplateScriptDefinition accepts variables that exactly match placeholders', () => {
  const result = validateTemplateScriptDefinition('echo ${service} && echo ${region}', [
    {
      name: 'service',
      label: '服务名',
      inputType: 'text',
      required: true,
      defaultValue: '',
      placeholder: '',
    },
    {
      name: 'region',
      label: '区域',
      inputType: 'text',
      required: false,
      defaultValue: '',
      placeholder: '',
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.message, null);
});

void test('normalizeTemplateVariableDefinitions trims variable names before persistence', () => {
  const result = normalizeTemplateVariableDefinitions([
    {
      name: ' service ',
      label: '服务名',
      inputType: 'text',
      required: true,
      defaultValue: '',
      placeholder: '',
    },
  ]);

  assert.deepEqual(result, [
    {
      name: 'service',
      label: '服务名',
      inputType: 'text',
      required: true,
      defaultValue: '',
      placeholder: '',
    },
  ]);
});
