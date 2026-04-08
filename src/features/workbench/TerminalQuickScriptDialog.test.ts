import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScriptVariableInitialValues,
  renderScriptTemplate,
  validateScriptVariableValues,
} from './scriptLibraryModel.js';

void test('template quick-script variable defaults render final command for submission', () => {
  const variables = [
    {
      name: 'service',
      label: '服务名',
      inputType: 'text' as const,
      required: true,
      defaultValue: 'nginx',
      placeholder: '',
    },
  ];

  const values = buildScriptVariableInitialValues(variables);
  const validation = validateScriptVariableValues(variables, values);
  assert.equal(validation.ok, true);
  assert.equal(renderScriptTemplate('systemctl restart ${service}', values), 'systemctl restart nginx');
});

void test('template quick-script variable validation rejects missing required values', () => {
  const variables = [
    {
      name: 'service',
      label: '服务名',
      inputType: 'text' as const,
      required: true,
      defaultValue: '',
      placeholder: 'nginx',
    },
  ];

  const values = buildScriptVariableInitialValues(variables);
  const validation = validateScriptVariableValues(variables, values);
  assert.equal(validation.ok, false);
  assert.match(validation.message ?? '', /服务名/);
});
