import assert from 'node:assert/strict';
import test from 'node:test';

import { createAgentRunRegistry, type OpenHumanGateInput } from './agentRunRegistry.js';

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

void test('registering the same run twice is rejected', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'wait for approval',
  });

  assert.throws(
    () =>
      registry.registerRun({
        runId: 'run-1',
        sessionId: 'session-2',
        task: 'different run',
      }),
    /已存在/
  );
});

void test('opening a gate with a mismatched session id is rejected', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check session binding',
  });

  assert.throws(
    () =>
      registry.openGate({
        runId: 'run-1',
        sessionId: 'session-2',
        kind: 'terminal_input',
        reason: '命令正在等待用户在终端中继续输入。',
        deadlineAt: 1_700_000_000_000,
        payload: {
          toolCallId: 'call-1',
          toolName: 'session.run_command',
          command: 'sudo passwd root',
          timeoutMs: 300000,
        },
      }),
    /session/
  );
});

void test('getRun returns a defensive snapshot instead of the live registry record', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check immutable snapshot',
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
  assert.ok(snapshot?.openGate);

  snapshot.state = 'failed';
  snapshot.openGate.status = 'resolved';
  snapshot.openGate.reason = 'mutated';

  const freshSnapshot = registry.getRun('run-1');
  assert.equal(freshSnapshot?.state, 'waiting_for_human');
  assert.equal(freshSnapshot?.openGate?.status, 'open');
  assert.equal(freshSnapshot?.openGate?.reason, gate.reason);
});

void test('expiring a gate twice is rejected', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check expire invariant',
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
  assert.throws(
    () => registry.expireGate({ runId: 'run-1', gateId: gate.id }),
    /open/
  );
});

void test('opening a new gate on a suspended run is rejected', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check run state invariant',
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
  assert.throws(
    () =>
      registry.openGate({
        runId: 'run-1',
        sessionId: 'session-1',
        kind: 'approval',
        reason: '高危命令需要人工批准。',
        deadlineAt: 1_700_000_000_100,
        payload: {
          toolCallId: 'call-2',
          toolName: 'session.run_command',
          arguments: {
            command: 'sudo whoami',
          },
          policy: {
            action: 'require_approval',
            matches: [],
          },
        },
      }),
    /running/
  );
});

void test('reopening an expired terminal_input gate moves the run back to waiting_for_human', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'resume suspended wait',
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
  const reopenedGate = registry.markGateReopened({
    runId: 'run-1',
    gateId: gate.id,
    deadlineAt: 1_700_000_000_100,
  });
  const snapshot = registry.getRun('run-1');

  assert.equal(snapshot?.state, 'waiting_for_human');
  assert.equal(reopenedGate.status, 'open');
  assert.equal(reopenedGate.deadlineAt, 1_700_000_000_100);
});

void test('resolving or rejecting a gate is only allowed while it is open', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'approval review',
  });

  const gate = registry.openGate({
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'approval',
    reason: '高危命令需要人工批准。',
    deadlineAt: 1_700_000_000_000,
    payload: {
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      arguments: {
        command: 'systemctl restart nginx',
      },
      policy: {
        action: 'require_approval',
        matches: [
          {
            ruleId: 'service.restart',
            title: '服务重启',
            severity: 'high',
            reason: '重启服务前需要人工确认。',
          },
        ],
      },
    },
  });

  const resolvedGate = registry.resolveGate({ runId: 'run-1', gateId: gate.id });
  assert.equal(resolvedGate.status, 'resolved');
  assert.equal(registry.getRun('run-1')?.state, 'suspended');
  assert.throws(
    () => registry.rejectGate({ runId: 'run-1', gateId: gate.id }),
    /open/
  );
});

const validApprovalGateInput: OpenHumanGateInput = {
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
      matches: [],
    },
  },
};
void validApprovalGateInput;

function acceptOpenHumanGateInput(_input: OpenHumanGateInput) {}

acceptOpenHumanGateInput({
  runId: 'run-1',
  sessionId: 'session-1',
  kind: 'approval',
  reason: 'invalid payload',
  deadlineAt: 1_700_000_000_000,
  payload: {
    toolCallId: 'call-1',
    toolName: 'session.run_command',
    // @ts-expect-error approval gates must use approval payloads
    command: 'sudo passwd root',
    timeoutMs: 300000,
  },
});
