import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentRunRegistry } from './agentRunRegistry.js';

void test('opens a terminal_input gate and moves the run to waiting_for_human', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check interactive command',
  });

  const gate = registry.openGate({
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'terminal_input',
    reason: '命令正在等待用户在终端中继续输入。',
    deadlineAt: 1_700_000_000_000,
    payload: {
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      command: 'sudo passwd root',
      timeoutMs: 300000,
    },
  });

  const snapshot = registry.getRun('run-1');
  assert.equal(snapshot?.state, 'waiting_for_human');
  assert.equal(gate.kind, 'terminal_input');
  assert.equal(gate.status, 'open');
});

void test('expiring a gate suspends the run instead of failing it', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'wait for input',
  });

  const gate = registry.openGate({
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'terminal_input',
    reason: '命令正在等待用户在终端中继续输入。',
    deadlineAt: 1_700_000_000_000,
    payload: {
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      command: 'sudo passwd root',
      timeoutMs: 300000,
    },
  });

  registry.expireGate({ runId: 'run-1', gateId: gate.id });
  const snapshot = registry.getRun('run-1');

  assert.equal(snapshot?.state, 'suspended');
  assert.equal(snapshot?.openGate?.status, 'expired');
});

void test('opening a second open gate for the same run is rejected', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'wait for approval',
  });

  registry.openGate({
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'approval',
    reason: '高危命令需要人工批准。',
    deadlineAt: 1_700_000_000_000,
    payload: {
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      arguments: {
        command: 'sudo rm -rf /tmp/demo',
      },
      policy: {
        action: 'require_approval',
        matches: [
          {
            ruleId: 'rule-1',
            title: 'High risk command',
            severity: 'high',
            reason: 'sudo rm is destructive',
          },
        ],
      },
    },
  });

  assert.throws(
    () =>
      registry.openGate({
        runId: 'run-1',
        sessionId: 'session-1',
        kind: 'approval',
        reason: '重复打开 gate。',
        deadlineAt: 1_700_000_000_100,
        payload: {
          toolCallId: 'call-2',
          toolName: 'session.run_command',
          arguments: {
            command: 'sudo whoami',
          },
          policy: {
            action: 'require_approval',
            matches: [
              {
                ruleId: 'rule-2',
                title: 'Privileged command',
                severity: 'medium',
                reason: 'sudo requires approval',
              },
            ],
          },
        },
      }),
    /human gate/
  );
});
