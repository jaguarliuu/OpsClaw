import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildParameterGateFormState,
  buildParameterGateResolveInput,
  updateParameterGateFormValue,
  validateParameterGateSubmission,
} from './agentParameterGateModel.js';

void test('parameter gate form requires required fields before submission', () => {
  const state = buildParameterGateFormState({
    fields: [
      {
        name: 'username',
        label: '用户名',
        value: '',
        required: true,
        source: 'agent_inferred',
      },
      {
        name: 'password',
        label: '密码',
        value: '',
        required: true,
        source: 'agent_inferred',
      },
    ],
  });

  assert.deepEqual(validateParameterGateSubmission(state), {
    ok: false,
    missing: ['username', 'password'],
  });
});

void test('parameter gate resolve input preserves string field values', () => {
  const initialState = buildParameterGateFormState({
    fields: [
      {
        name: 'username',
        label: '用户名',
        value: 'ops-admin',
        required: true,
        source: 'user_explicit',
      },
      {
        name: 'password',
        label: '密码',
        value: '',
        required: true,
        source: 'agent_inferred',
      },
    ],
  });
  const state = updateParameterGateFormValue(initialState, 'password', '  super-secret  ');

  assert.deepEqual(validateParameterGateSubmission(state), { ok: true });
  assert.deepEqual(buildParameterGateResolveInput(state), {
    fields: {
      username: 'ops-admin',
      password: '  super-secret  ',
    },
  });
});
