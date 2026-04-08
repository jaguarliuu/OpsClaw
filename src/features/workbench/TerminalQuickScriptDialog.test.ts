import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScriptVariableInitialValues,
  renderScriptTemplate,
  validateScriptVariableValues,
} from './scriptLibraryModel.js';

void test('template quick script requires variables before rendering final command', () => {
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
