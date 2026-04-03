import { randomUUID } from 'node:crypto';

import type {
  AgentRunState,
  ApprovalGatePayload,
  HumanGateRecord,
  TerminalInputGatePayload,
} from './humanGateTypes.js';

export type AgentRunRecord = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  openGate: HumanGateRecord | null;
};

export type RegisterRunInput = Pick<AgentRunRecord, 'runId' | 'sessionId' | 'task'>;

type OpenHumanGateInputBase = {
  runId: string;
  sessionId: string;
  reason: string;
  deadlineAt: number;
};

export type OpenHumanGateInput =
  | (OpenHumanGateInputBase & {
      kind: 'terminal_input';
      payload: TerminalInputGatePayload;
    })
  | (OpenHumanGateInputBase & {
      kind: 'approval';
      payload: ApprovalGatePayload;
    });

export function createAgentRunRegistry() {
  const runs = new Map<string, AgentRunRecord>();

  return {
    registerRun(input: RegisterRunInput) {
      if (runs.has(input.runId)) {
        throw new Error('指定 Agent run 已存在。');
      }

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
      if (run.sessionId !== input.sessionId) {
        throw new Error('指定 session 与当前 run 不匹配。');
      }
      if (run.openGate?.status === 'open') {
        throw new Error('当前 run 已存在未完成的 human gate。');
      }

      const gate: HumanGateRecord =
        input.kind === 'terminal_input'
          ? {
              id: randomUUID(),
              runId: input.runId,
              sessionId: run.sessionId,
              kind: 'terminal_input',
              status: 'open',
              reason: input.reason,
              openedAt: Date.now(),
              deadlineAt: input.deadlineAt,
              payload: input.payload,
            }
          : {
              id: randomUUID(),
              runId: input.runId,
              sessionId: run.sessionId,
              kind: 'approval',
              status: 'open',
              reason: input.reason,
              openedAt: Date.now(),
              deadlineAt: input.deadlineAt,
              payload: input.payload,
            };

      run.state = 'waiting_for_human';
      run.openGate = gate;
      return structuredClone(gate);
    },

    expireGate(input: { runId: string; gateId: string }) {
      const run = runs.get(input.runId);
      if (!run?.openGate || run.openGate.id !== input.gateId) {
        throw new Error('指定 human gate 不存在。');
      }
      if (run.openGate.status !== 'open') {
        throw new Error('只能 expire 当前处于 open 状态的 human gate。');
      }

      run.openGate.status = 'expired';
      run.state = 'suspended';
    },

    getRun(runId: string) {
      const run = runs.get(runId);
      return run ? structuredClone(run) : null;
    },
  };
}
