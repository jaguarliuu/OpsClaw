import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateSessionCommandPolicy } from './commandPolicy.js';

void test('allows readonly shell commands in auto-readonly mode', () => {
  const decision = evaluateSessionCommandPolicy({
    approvalMode: 'auto-readonly',
    command: 'ls -la /var/log',
  });

  assert.equal(decision.kind, 'allow');
  assert.deepEqual(decision.matches, []);
});

void test('denies destructive delete commands in auto-readonly mode with stable rule ids', () => {
  const decision = evaluateSessionCommandPolicy({
    approvalMode: 'auto-readonly',
    command: 'rm -rf /tmp/demo',
  });

  assert.equal(decision.kind, 'deny');
  assert.equal(decision.matches[0]?.ruleId, 'shell.delete.recursive');
});

void test('requires approval for service restart in manual-sensitive mode', () => {
  const decision = evaluateSessionCommandPolicy({
    approvalMode: 'manual-sensitive',
    command: 'systemctl restart nginx',
  });

  assert.equal(decision.kind, 'require_approval');
  assert.equal(decision.matches[0]?.ruleId, 'service.restart');
});
