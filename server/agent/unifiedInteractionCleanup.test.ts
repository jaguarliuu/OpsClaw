import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAgentRunRegistry } from './agentRunRegistry.js';
import type { InteractionRequest } from './interactionTypes.js';

function createApprovalInteraction(
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
    message: '该操作需要用户审批后执行。',
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

void test('agent server source no longer contains legacy human gate event types', () => {
  const agentTypesSource = readFileSync(new URL('./agentTypes.ts', import.meta.url), 'utf8');
  const taskTypesSource = readFileSync(new URL('./taskTypes.ts', import.meta.url), 'utf8');

  assert.equal(agentTypesSource.includes('human_gate_opened'), false);
  assert.equal(agentTypesSource.includes('human_gate_resolved'), false);
  assert.equal(agentTypesSource.includes('human_gate_rejected'), false);
  assert.equal(agentTypesSource.includes('human_gate_expired'), false);
  assert.equal(taskTypesSource.includes("kind: 'human_gate'"), false);
});

void test('interaction protocol no longer exposes approval_required compatibility events', () => {
  const agentTypesSource = readFileSync(new URL('./agentTypes.ts', import.meta.url), 'utf8');
  const workbenchTypesSource = readFileSync(
    new URL('../../src/features/workbench/types.agent.ts', import.meta.url),
    'utf8'
  );
  const workbenchModelSource = readFileSync(
    new URL('../../src/features/workbench/useAgentRunModel.ts', import.meta.url),
    'utf8'
  );

  assert.equal(agentTypesSource.includes("type: 'approval_required'"), false);
  assert.equal(workbenchTypesSource.includes("type: 'approval_required'"), false);
  assert.equal(workbenchModelSource.includes("event.type === 'approval_required'"), false);
});

void test('agent runtime and registry source no longer contain legacy gate compatibility helpers', () => {
  const runtimeSource = readFileSync(new URL('./agentRuntime.ts', import.meta.url), 'utf8');
  const registrySource = readFileSync(new URL('./agentRunRegistry.ts', import.meta.url), 'utf8');

  assert.equal(runtimeSource.includes('resumeWaiting('), false);
  assert.equal(runtimeSource.includes('resolveGate('), false);
  assert.equal(runtimeSource.includes('rejectGate('), false);
  assert.equal(registrySource.includes('openGate: '), false);
  assert.equal(registrySource.includes('openGate(input:'), false);
  assert.equal(registrySource.includes('resolveGate(input:'), false);
  assert.equal(registrySource.includes('rejectGate(input:'), false);
});

void test('agent run snapshots only expose activeInteraction for blocked state', () => {
  const registry = createAgentRunRegistry();
  registry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: '重启 nginx',
  });

  registry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: createApprovalInteraction(),
  });

  const snapshot = registry.getRun('run-1');
  assert.ok(snapshot);
  assert.equal(snapshot.activeInteraction?.id, 'interaction-1');
  assert.equal(Object.hasOwn(snapshot, 'openGate'), false);
});
