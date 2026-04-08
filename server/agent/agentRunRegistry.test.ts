import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentRunRegistry,
  type OpenInteractionInput,
} from './agentRunRegistry.js';
import type { InteractionRequest } from './interactionTypes.js';

function createDangerConfirmRequest(overrides?: Partial<InteractionRequest>): InteractionRequest {
  return {
    id: 'req-1',
    runId: 'run-1',
    sessionId: 'session-1',
    status: 'open',
    interactionKind: 'danger_confirm',
    riskLevel: 'critical',
    blockingMode: 'hard_block',
    title: '确认高危操作',
    message: '将创建具备 sudo 权限的新用户。',
    schemaVersion: 'v1',
    fields: [{ type: 'confirm', key: 'confirmed', label: '我确认继续', required: true }],
    actions: [
      { id: 'approve', label: '继续执行', kind: 'approve', style: 'danger' },
      { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
    ],
    openedAt: 1,
    deadlineAt: null,
    metadata: { source: 'danger_confirmation' },
    ...overrides,
  };
}

function createTerminalWaitRequest(overrides?: Partial<InteractionRequest>): InteractionRequest {
  return {
    id: 'req-1',
    runId: 'run-1',
    sessionId: 'session-1',
    status: 'open',
    interactionKind: 'terminal_wait',
    riskLevel: 'medium',
    blockingMode: 'hard_block',
    title: '等待终端交互',
    message: '命令正在等待用户在终端输入。',
    schemaVersion: 'v1',
    fields: [{ type: 'display', key: 'command', value: 'sudo passwd root' }],
    actions: [
      {
        id: 'continue',
        label: '继续等待',
        kind: 'continue_waiting',
        style: 'primary',
      },
      { id: 'cancel', label: '取消', kind: 'cancel', style: 'secondary' },
    ],
    openedAt: 1,
    deadlineAt: 1_700_000_000_000,
    metadata: { source: 'terminal_wait' },
    ...overrides,
  };
}

void test('opening an interaction stores activeInteraction and blocks the run', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: '创建 root 权限用户',
  });

  registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createDangerConfirmRequest(),
  });

  const snapshot = registry.getRun('run-1');
  assert.equal(snapshot?.executionState, 'blocked_by_interaction');
  assert.equal(snapshot?.blockingMode, 'interaction');
  assert.equal(snapshot?.activeInteraction?.interactionKind, 'danger_confirm');
});

void test('opening a non-blocking interaction is rejected so the run snapshot stays self-consistent', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'show informational prompt',
  });

  assert.throws(
    () =>
      registry.openInteraction({
        runId: 'run-1',
        sessionId: 'session-1',
        request: createDangerConfirmRequest({
          blockingMode: 'none',
        }),
      }),
    /阻断|blocking/
  );

  const snapshot = registry.getRun('run-1');
  assert.equal(snapshot?.state, 'running');
  assert.equal(snapshot?.executionState, 'running');
  assert.equal(snapshot?.blockingMode, 'none');
  assert.equal(snapshot?.activeInteraction, null);
});

void test('opening a terminal_wait interaction marks the run as blocked_by_terminal', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check interactive command',
  });

  const request = registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createTerminalWaitRequest(),
  });

  const snapshot = registry.getRun('run-1');
  assert.equal(snapshot?.state, 'waiting_for_human');
  assert.equal(snapshot?.executionState, 'blocked_by_terminal');
  assert.equal(snapshot?.blockingMode, 'terminal_wait');
  assert.equal(snapshot?.activeInteraction?.interactionKind, 'terminal_wait');
  assert.equal(request.status, 'open');
});

void test('legacy openGate bridge keeps openGate projected from activeInteraction across resolveGate', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'legacy approval bridge',
  });

  const gate = registry.openGate({
    runId: 'run-1',
    sessionId: 'session-1',
    kind: 'approval',
    reason: 'legacy runtime still opens approval gates',
    deadlineAt: null,
    payload: {
      toolCallId: 'call-1',
      toolName: 'session.run_command',
      arguments: {
        command: 'useradd ops-admin',
      },
      policy: {
        action: 'require_approval',
        matches: [],
      },
    },
  });

  const waitingSnapshot = registry.getRun('run-1');
  assert.equal(waitingSnapshot?.activeInteraction?.id, gate.id);
  assert.equal(waitingSnapshot?.openGate?.id, gate.id);
  assert.equal(waitingSnapshot?.openGate?.status, 'open');
  assert.equal(waitingSnapshot?.openGate?.presentationMode, 'inline_ui_action');

  registry.resolveGate({ runId: 'run-1', gateId: gate.id });
  const resolvedSnapshot = registry.getRun('run-1');
  assert.equal(resolvedSnapshot?.activeInteraction?.status, 'resolved');
  assert.equal(resolvedSnapshot?.openGate?.status, 'resolved');
});

void test('expiring an interaction suspends the run instead of failing it', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'wait for input',
  });

  const request = registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createTerminalWaitRequest(),
  });

  registry.expireInteraction({ runId: 'run-1', interactionId: request.id });
  const snapshot = registry.getRun('run-1');

  assert.equal(snapshot?.state, 'suspended');
  assert.equal(snapshot?.activeInteraction?.status, 'expired');
});

void test('opening a second open interaction for the same run is rejected', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'wait for approval',
  });

  registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createDangerConfirmRequest(),
  });

  assert.throws(
    () =>
      registry.openInteraction({
        runId: 'run-1',
        sessionId: 'session-1',
        request: createDangerConfirmRequest({
          id: 'req-2',
          openedAt: 2,
        }),
      }),
    /interaction/
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

void test('opening an interaction with a mismatched session id is rejected', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check session binding',
  });

  assert.throws(
    () =>
      registry.openInteraction({
        runId: 'run-1',
        sessionId: 'session-2',
        request: createTerminalWaitRequest({
          sessionId: 'session-2',
        }),
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

  const request = registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createTerminalWaitRequest(),
  });

  const snapshot = registry.getRun('run-1');
  assert.ok(snapshot?.activeInteraction);

  snapshot.state = 'failed';
  snapshot.activeInteraction.status = 'resolved';
  snapshot.activeInteraction.message = 'mutated';

  const freshSnapshot = registry.getRun('run-1');
  assert.equal(freshSnapshot?.state, 'waiting_for_human');
  assert.equal(freshSnapshot?.activeInteraction?.status, 'open');
  assert.equal(freshSnapshot?.activeInteraction?.message, request.message);
});

void test('expiring an interaction twice is rejected', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check expire invariant',
  });

  const request = registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createTerminalWaitRequest(),
  });

  registry.expireInteraction({ runId: 'run-1', interactionId: request.id });
  assert.throws(
    () => registry.expireInteraction({ runId: 'run-1', interactionId: request.id }),
    /open/
  );
});

void test('optional snapshot sink receives updated run snapshots after state transitions', () => {
  const snapshots: Array<{ runId: string; state: string; interactionStatus: string | null }> = [];
  const registry = createAgentRunRegistry({
    snapshotStore: {
      save(snapshot) {
        snapshots.push({
          runId: snapshot.runId,
          state: snapshot.state,
          interactionStatus: snapshot.activeInteraction?.status ?? null,
        });
      },
    },
  });

  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'wait for input',
  });

  const request = registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createTerminalWaitRequest(),
  });

  registry.expireInteraction({ runId: 'run-1', interactionId: request.id });

  assert.deepEqual(snapshots, [
    { runId: 'run-1', state: 'running', interactionStatus: null },
    { runId: 'run-1', state: 'waiting_for_human', interactionStatus: 'open' },
    { runId: 'run-1', state: 'suspended', interactionStatus: 'expired' },
  ]);
});

void test('getReattachableRun returns the latest waiting or suspended run for a session', () => {
  const registry = createAgentRunRegistry();

  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'older run',
  });
  const request1 = registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createTerminalWaitRequest(),
  });
  registry.expireInteraction({ runId: 'run-1', interactionId: request1.id });

  registry.registerRun({
    runId: 'run-2',
    sessionId: 'session-1',
    task: 'newer run',
  });
  registry.openInteraction({
    runId: 'run-2',
    sessionId: 'session-1',
    request: createDangerConfirmRequest({
      runId: 'run-2',
      sessionId: 'session-1',
      id: 'req-2',
      openedAt: 2,
    }),
  });

  const reattachable = registry.getReattachableRun('session-1');

  assert.equal(reattachable?.runId, 'run-2');
  assert.equal(reattachable?.state, 'waiting_for_human');
  assert.equal(reattachable?.activeInteraction?.id, 'req-2');
});

void test('opening a new interaction on a suspended run is rejected', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'check run state invariant',
  });

  const request = registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createTerminalWaitRequest(),
  });

  registry.expireInteraction({ runId: 'run-1', interactionId: request.id });
  assert.throws(
    () =>
      registry.openInteraction({
        runId: 'run-1',
        sessionId: 'session-1',
        request: createDangerConfirmRequest({
          id: 'req-2',
          openedAt: 2,
        }),
      }),
    /running/
  );
});

void test('reopening an expired terminal_wait interaction moves the run back to waiting_for_human', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'resume suspended wait',
  });

  const request = registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createTerminalWaitRequest(),
  });

  registry.expireInteraction({ runId: 'run-1', interactionId: request.id });
  const reopened = registry.markInteractionReopened({
    runId: 'run-1',
    interactionId: request.id,
    deadlineAt: 1_700_000_000_100,
  });
  const snapshot = registry.getRun('run-1');

  assert.equal(snapshot?.state, 'waiting_for_human');
  assert.equal(reopened.status, 'open');
  assert.equal(reopened.deadlineAt, 1_700_000_000_100);
  assert.equal(snapshot?.executionState, 'blocked_by_terminal');
  assert.equal(snapshot?.blockingMode, 'terminal_wait');
});

void test('resolving or rejecting an interaction is only allowed while it is open', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'approval review',
  });

  const request = registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createDangerConfirmRequest(),
  });

  const resolved = registry.resolveInteraction({
    runId: 'run-1',
    interactionId: request.id,
  });
  assert.equal(resolved.status, 'resolved');
  assert.equal(registry.getRun('run-1')?.state, 'suspended');
  assert.throws(
    () =>
      registry.rejectInteraction({
        runId: 'run-1',
        interactionId: request.id,
      }),
    /open/
  );
});

const validOpenInteractionInput: OpenInteractionInput = {
  runId: 'run-1',
  sessionId: 'session-1',
  request: createDangerConfirmRequest(),
};
void validOpenInteractionInput;

function acceptOpenInteractionInput(_input: OpenInteractionInput) {}

acceptOpenInteractionInput({
  runId: 'run-1',
  sessionId: 'session-1',
  request: {
    ...createDangerConfirmRequest(),
    // @ts-expect-error interaction title must be a string
    title: 123,
  },
});
