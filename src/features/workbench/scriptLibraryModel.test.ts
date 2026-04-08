import assert from 'node:assert/strict';
import test from 'node:test';

import type { ScriptLibraryItem, ScriptVariableDefinition } from './types.js';
import {
  extractTemplateVariableNames,
  filterScriptLibraryItems,
  renderScriptTemplate,
  validateScriptAlias,
  validateScriptVariableValues,
} from './scriptLibraryModel.js';

const requiredVariable: ScriptVariableDefinition = {
  name: 'service',
  label: '服务名',
  inputType: 'text',
  required: true,
  defaultValue: '',
  placeholder: 'nginx',
};

void test('renderScriptTemplate replaces placeholders with provided values', () => {
  const output = renderScriptTemplate('sudo systemctl restart ${service}', {
    service: 'nginx',
  });

  assert.equal(output, 'sudo systemctl restart nginx');
});

void test('extractTemplateVariableNames returns unique placeholders in declaration order', () => {
  assert.deepEqual(
    extractTemplateVariableNames('echo ${service} && echo ${region} && echo ${service}'),
    ['service', 'region']
  );
});

void test('validateScriptVariableValues rejects missing required values', () => {
  const result = validateScriptVariableValues([requiredVariable], {
    service: '   ',
  });

  assert.equal(result.ok, false);
  assert.match(result.message ?? '', /服务名/);
});

void test('validateScriptAlias validates required and allowed pattern', () => {
  const empty = validateScriptAlias('   ');
  assert.equal(empty.ok, false);
  assert.equal(empty.message, '脚本别名不能为空。');

  const invalid = validateScriptAlias('Nginx Restart');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.message, '脚本别名只能包含小写字母、数字、-、_。');

  const valid = validateScriptAlias('nginx-restart_1');
  assert.equal(valid.ok, true);
  assert.equal(valid.message, null);
});

void test('filterScriptLibraryItems matches title, key, and tags case-insensitively', () => {
  const items: ScriptLibraryItem[] = [
    {
      id: 'script-1',
      key: 'restart-nginx',
      alias: 'restart-nginx',
      scope: 'global',
      nodeId: null,
      title: '重启 Nginx',
      description: '重启服务',
      kind: 'plain',
      content: 'sudo systemctl restart nginx',
      variables: [],
      tags: ['OPS', 'web'],
      resolvedFrom: 'global',
      overridesGlobal: false,
      createdAt: '2026-03-31T00:00:00.000Z',
      updatedAt: '2026-03-31T00:00:00.000Z',
    },
  ];

  assert.equal(filterScriptLibraryItems(items, 'nginx').length, 1);
  assert.equal(filterScriptLibraryItems(items, 'restart').length, 1);
  assert.equal(filterScriptLibraryItems(items, 'ops').length, 1);
  assert.equal(filterScriptLibraryItems(items, 'redis').length, 0);
});

void test('filterScriptLibraryItems matches alias before title and tags', () => {
  const items: ScriptLibraryItem[] = [
    {
      id: 'script-1',
      key: 'restart-nginx',
      alias: 'svc-nginx',
      scope: 'global',
      nodeId: null,
      title: '重启 Nginx',
      description: '重启服务',
      kind: 'plain',
      content: 'systemctl restart nginx',
      variables: [],
      tags: ['ops'],
      resolvedFrom: 'global',
      overridesGlobal: false,
      createdAt: '',
      updatedAt: '',
    },
  ];

  assert.equal(filterScriptLibraryItems(items, 'svc').length, 1);
});
