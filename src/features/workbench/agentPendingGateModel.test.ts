import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPendingUiGateItems, reducePendingUiGates } from './agentPendingGateModel.js';

void test('buildPendingUiGateItems only includes inline_ui_action gates and sorts approval first', () => {
  const items = buildPendingUiGateItems([
    {
      id: 'gate-terminal-wait',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'approval',
      status: 'open',
      reason: 'should be ignored because terminal wait',
      openedAt: 3,
      deadlineAt: null,
      presentationMode: 'terminal_wait',
      payload: {
        toolCallId: 'call-0',
        toolName: 'session.run_command',
        arguments: {},
        policy: { action: 'require_approval', matches: [] },
      },
    },
    {
      id: 'gate-approval-2',
      runId: 'run-2',
      sessionId: 'session-1',
      kind: 'approval',
      status: 'open',
      reason: 'second approval',
      openedAt: 5,
      deadlineAt: null,
      presentationMode: 'inline_ui_action',
      payload: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        arguments: {},
        policy: { action: 'require_approval', matches: [] },
      },
    },
    {
      id: 'gate-param-1',
      runId: 'run-3',
      sessionId: 'session-1',
      kind: 'parameter_confirmation',
      status: 'open',
      reason: 'param confirmation',
      openedAt: 1,
      deadlineAt: null,
      presentationMode: 'inline_ui_action',
      payload: {
        toolCallId: 'call-2',
        toolName: 'session.run_command',
        command: 'echo hi',
        intentKind: 'diagnostic.readonly',
        fields: [],
      },
    },
    {
      id: 'gate-approval-1',
      runId: 'run-4',
      sessionId: 'session-1',
      kind: 'approval',
      status: 'open',
      reason: 'first approval',
      openedAt: 1,
      deadlineAt: null,
      presentationMode: 'inline_ui_action',
      payload: {
        toolCallId: 'call-3',
        toolName: 'session.run_command',
        arguments: {},
        policy: { action: 'require_approval', matches: [] },
      },
    },
  ]);

  assert.deepEqual(
    items.map((item) => ({
      gateId: item.gateId,
      kind: item.kind,
      openedAt: item.openedAt,
      title: item.title,
      summary: item.summary,
    })),
    [
      {
        gateId: 'gate-approval-1',
        kind: 'approval',
        openedAt: 1,
        title: '待批准',
        summary: 'first approval',
      },
      {
        gateId: 'gate-approval-2',
        kind: 'approval',
        openedAt: 5,
        title: '待批准',
        summary: 'second approval',
      },
      {
        gateId: 'gate-param-1',
        kind: 'parameter_confirmation',
        openedAt: 1,
        title: '待补全',
        summary: 'param confirmation',
      },
    ]
  );
});

void test('reducePendingUiGates replaces the previous open gate when the same run opens a new UI gate', () => {
  const first = reducePendingUiGates([], {
    type: 'human_gate_opened',
    runId: 'run-1',
    gate: {
      id: 'gate-1',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'approval',
      status: 'open',
      reason: 'first gate',
      openedAt: 1,
      deadlineAt: null,
      presentationMode: 'inline_ui_action',
      payload: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        arguments: {},
        policy: { action: 'require_approval', matches: [] },
      },
    },
    timestamp: 1,
  });

  const second = reducePendingUiGates(first, {
    type: 'human_gate_opened',
    runId: 'run-1',
    gate: {
      id: 'gate-2',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'approval',
      status: 'open',
      reason: 'second gate',
      openedAt: 2,
      deadlineAt: null,
      presentationMode: 'inline_ui_action',
      payload: {
        toolCallId: 'call-2',
        toolName: 'session.run_command',
        arguments: {},
        policy: { action: 'require_approval', matches: [] },
      },
    },
    timestamp: 2,
  });

  assert.deepEqual(second, [
    {
      gateId: 'gate-2',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'approval',
      title: '待批准',
      summary: 'second gate',
      openedAt: 2,
    },
  ]);
});

void test('buildPendingUiGateItems ignores resolved or rejected UI gates', () => {
  const items = buildPendingUiGateItems([
    {
      id: 'gate-resolved',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'approval',
      status: 'resolved',
      reason: 'already handled',
      openedAt: 1,
      deadlineAt: null,
      presentationMode: 'inline_ui_action',
      payload: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        arguments: {},
        policy: { action: 'require_approval', matches: [] },
      },
    },
  ]);

  assert.deepEqual(items, []);
});
