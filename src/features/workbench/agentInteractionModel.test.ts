import assert from 'node:assert/strict';
import test from 'node:test';

import type { InteractionRequest } from './types.agent.js';
import {
  buildPendingInteractionItems,
  toInteractionViewModel,
} from './agentInteractionModel.js';

function makeInteractionRequest(
  overrides: Partial<InteractionRequest> = {}
): InteractionRequest {
  return {
    id: 'interaction-1',
    runId: 'run-1',
    sessionId: 'session-1',
    status: 'open',
    interactionKind: 'approval',
    riskLevel: 'high',
    blockingMode: 'hard_block',
    title: '操作审批',
    message: '需要用户确认后继续执行。',
    schemaVersion: 'v1',
    fields: [],
    actions: [
      { id: 'approve', label: '继续执行', kind: 'approve', style: 'danger' },
      { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
    ],
    openedAt: 1,
    deadlineAt: null,
    metadata: {},
    ...overrides,
  };
}

void test('terminal_wait stays out of pendingInteractions queue', () => {
  const items = buildPendingInteractionItems([
    makeInteractionRequest({
      id: 'interaction-terminal',
      interactionKind: 'terminal_wait',
      blockingMode: 'hard_block',
    }),
    makeInteractionRequest({
      id: 'interaction-approval',
      interactionKind: 'approval',
      blockingMode: 'soft_block',
    }),
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.interactionKind, 'approval');
});

void test('collect_input with password field maps to password input metadata', () => {
  const view = toInteractionViewModel(
    makeInteractionRequest({
      interactionKind: 'collect_input',
      fields: [
        {
          type: 'password',
          key: 'password',
          label: '密码',
          required: true,
        },
      ],
    })
  );

  assert.equal(view.fields[0]?.kind, 'input');
  assert.equal(view.fields[0]?.inputType, 'password');
});
