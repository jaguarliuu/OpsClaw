import { randomUUID } from 'node:crypto';

import type {
  AgentRunState,
  HumanGateKind,
  HumanGatePayload,
  HumanGateRecord,
} from './humanGateTypes.js';

export type AgentRunRecord = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  openGate: HumanGateRecord | null;
};

export type RegisterRunInput = Pick<AgentRunRecord, 'runId' | 'sessionId' | 'task'>;

export type OpenHumanGateInput = {
  runId: string;
  sessionId: string;
  kind: HumanGateKind;
  reason: string;
  deadlineAt: number;
  payload: HumanGatePayload;
};

export function createAgentRunRegistry() {
  const runs = new Map<string, AgentRunRecord>();

  return {
    registerRun(input: RegisterRunInput) {
      runs.set(input.runId, {
        ...input,
        state: 'running',
        openGate: null,
      });
    },

    openGate(input: OpenHumanGateInput) {
      const run = runs.get(input.runId);
      if (!run) {
        throw new Error('Agent run 不存在。');
      }
      if (run.openGate?.status === 'open') {
        throw new Error('当前 run 已存在未完成的 human gate。');
      }

      const gate: HumanGateRecord = {
        id: randomUUID(),
        runId: input.runId,
        sessionId: input.sessionId,
        kind: input.kind,
        status: 'open',
        reason: input.reason,
        openedAt: Date.now(),
        deadlineAt: input.deadlineAt,
        payload: input.payload,
      };

      run.state = 'waiting_for_human';
      run.openGate = gate;
      return gate;
    },

    expireGate(input: { runId: string; gateId: string }) {
      const run = runs.get(input.runId);
      if (!run?.openGate || run.openGate.id !== input.gateId) {
        throw new Error('指定 human gate 不存在。');
      }

      run.openGate.status = 'expired';
      run.state = 'suspended';
    },

    getRun(runId: string) {
      return runs.get(runId) ?? null;
    },
  };
}
