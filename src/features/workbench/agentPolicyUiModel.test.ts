import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAgentPolicySummary } from './agentPolicyUiModel.js';

void test('formats matched policy ids and titles for warning cards', () => {
  assert.equal(
    formatAgentPolicySummary({
      action: 'deny',
      matches: [
        {
          ruleId: 'shell.delete.recursive',
          title: '递归删除',
          severity: 'critical',
          reason: '命令包含递归删除，可能造成不可逆数据丢失。',
          matchedText: 'rm -rf',
        },
      ],
    }),
    '已命中策略：shell.delete.recursive（递归删除）'
  );
});

void test('returns null when no policy matches are present', () => {
  assert.equal(
    formatAgentPolicySummary({
      action: 'require_approval',
      matches: [],
    }),
    null
  );
  assert.equal(formatAgentPolicySummary(undefined), null);
});
