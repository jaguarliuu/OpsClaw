import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSessionCommandPlan } from './sessionCommandPlanner.js';
import { resolveEffectiveOpsClawRules } from './opsclawRules.js';

const effectiveRules = resolveEffectiveOpsClawRules(
  {
    version: 1,
    global: {
      intents: {
        'diagnostic.readonly': {
          defaultRisk: 'low',
          requireApproval: false,
          protectedParameters: [],
        },
        user_management: {
          defaultRisk: 'high',
          requireApproval: true,
          protectedParameters: ['username', 'password', 'sudo_policy'],
        },
      },
    },
    groups: {},
  },
  null
);

void test('allows readonly diagnostics when no protected parameters are needed', () => {
  const plan = buildSessionCommandPlan({
    command: 'df -h',
    effectiveRules,
    sessionGroupName: null,
    userTask: '检查磁盘使用情况',
  });

  assert.equal(plan.intent.kind, 'diagnostic.readonly');
  assert.equal(plan.decision.kind, 'allow_auto_execute');
});

void test('requires parameter confirmation when user management command invents username and password', () => {
  const plan = buildSessionCommandPlan({
    command: 'sudo useradd -m adminuser && echo "adminuser:secret123" | sudo chpasswd',
    effectiveRules,
    sessionGroupName: null,
    userTask: '创建一个 root 权限用户',
  });

  assert.equal(plan.intent.kind, 'user_management');
  assert.equal(plan.decision.kind, 'require_parameter_confirmation');
  assert.deepEqual(
    plan.parameters.map((parameter) => [parameter.name, parameter.source]),
    [
      ['username', 'agent_inferred'],
      ['password', 'agent_inferred'],
    ]
  );
});

void test('treats explicit usernames as user-provided and still requires approval for user management', () => {
  const plan = buildSessionCommandPlan({
    command: 'sudo adduser ops-admin',
    effectiveRules,
    sessionGroupName: null,
    userTask: '创建一个 root 权限用户，用户名叫 ops-admin',
  });

  assert.equal(plan.parameters[0]?.source, 'user_explicit');
  assert.equal(plan.decision.kind, 'require_approval');
});
