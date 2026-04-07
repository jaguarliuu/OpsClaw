import { randomUUID } from 'node:crypto';

import type {
  AgentRunBlockingMode,
  AgentRunExecutionState,
  AgentRunState,
  ApprovalGatePayload,
  HumanGateRecord,
  HumanGatePresentationMode,
  ParameterConfirmationGatePayload,
  TerminalInputGatePayload,
} from './humanGateTypes.js';

export type AgentRunRecord = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  executionState: AgentRunExecutionState;
  blockingMode: AgentRunBlockingMode;
  openGate: HumanGateRecord | null;
};

export type RegisterRunInput = Pick<AgentRunRecord, 'runId' | 'sessionId' | 'task'>;
export type AgentRunSnapshotStore = {
  save: (snapshot: AgentRunRecord) => void;
};

type OpenHumanGateInputBase = {
  runId: string;
  sessionId: string;
  reason: string;
  deadlineAt: number | null;
};

export type OpenHumanGateInput =
  | (OpenHumanGateInputBase & {
      kind: 'terminal_input';
      payload: TerminalInputGatePayload;
    })
  | (OpenHumanGateInputBase & {
      kind: 'approval';
      payload: ApprovalGatePayload;
    })
  | (OpenHumanGateInputBase & {
      kind: 'parameter_confirmation';
      payload: ParameterConfirmationGatePayload;
    });

export function createAgentRunRegistry(options?: {
  snapshotStore?: AgentRunSnapshotStore;
}) {
  const runs = new Map<string, AgentRunRecord>();

  function getGatePresentationMode(kind: OpenHumanGateInput['kind']): HumanGatePresentationMode {
    return kind === 'terminal_input' ? 'terminal_wait' : 'inline_ui_action';
  }

  function getOpenGateExecutionState(kind: OpenHumanGateInput['kind']): AgentRunExecutionState {
    return kind === 'terminal_input' ? 'blocked_by_terminal' : 'blocked_by_ui_gate';
  }

  function getOpenGateBlockingMode(kind: OpenHumanGateInput['kind']): AgentRunBlockingMode {
    return kind === 'terminal_input' ? 'terminal_input' : 'ui_gate';
  }

  function saveSnapshot(run: AgentRunRecord) {
    options?.snapshotStore?.save(structuredClone(run));
  }

  function getRequiredRun(runId: string) {
    const run = runs.get(runId);
    if (!run) {
      throw new Error('Agent run 不存在。');
    }

    return run;
  }

  function getRequiredGate(runId: string, gateId: string) {
    const run = getRequiredRun(runId);
    if (!run.openGate || run.openGate.id !== gateId) {
      throw new Error('指定 human gate 不存在。');
    }

    return { run, gate: run.openGate };
  }

  return {
    registerRun(input: RegisterRunInput) {
      if (runs.has(input.runId)) {
        throw new Error('指定 Agent run 已存在。');
      }

      runs.set(input.runId, {
        ...input,
        state: 'running',
        executionState: 'running',
        blockingMode: 'none',
        openGate: null,
      });
      saveSnapshot(getRequiredRun(input.runId));
    },

    openGate(input: OpenHumanGateInput) {
      const run = getRequiredRun(input.runId);
      if (run.state !== 'running') {
        throw new Error('只有处于 running 状态的 run 才能打开新的 human gate。');
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
              presentationMode: getGatePresentationMode(input.kind),
              payload: input.payload,
            }
          : input.kind === 'approval'
            ? {
                id: randomUUID(),
                runId: input.runId,
                sessionId: run.sessionId,
                kind: 'approval',
                status: 'open',
                reason: input.reason,
                openedAt: Date.now(),
                deadlineAt: input.deadlineAt,
                presentationMode: getGatePresentationMode(input.kind),
                payload: input.payload,
              }
          : {
              id: randomUUID(),
              runId: input.runId,
              sessionId: run.sessionId,
              kind: 'parameter_confirmation',
              status: 'open',
              reason: input.reason,
              openedAt: Date.now(),
              deadlineAt: input.deadlineAt,
              presentationMode: getGatePresentationMode(input.kind),
              payload: input.payload,
            };

      run.state = 'waiting_for_human';
      run.executionState = getOpenGateExecutionState(input.kind);
      run.blockingMode = getOpenGateBlockingMode(input.kind);
      run.openGate = gate;
      saveSnapshot(run);
      return structuredClone(gate);
    },

    expireGate(input: { runId: string; gateId: string }) {
      const { run, gate } = getRequiredGate(input.runId, input.gateId);
      if (gate.status !== 'open') {
        throw new Error('只能 expire 当前处于 open 状态的 human gate。');
      }

      gate.status = 'expired';
      run.state = 'suspended';
      run.executionState = 'suspended';
      run.blockingMode = 'none';
      saveSnapshot(run);
    },

    markGateReopened(input: { runId: string; gateId: string; deadlineAt: number }) {
      const { run, gate } = getRequiredGate(input.runId, input.gateId);
      if (gate.kind !== 'terminal_input') {
        throw new Error('只有 terminal_input gate 支持重新进入等待。');
      }
      if (gate.status !== 'expired') {
        throw new Error('只有处于 expired 状态的 gate 才能重新等待。');
      }

      gate.status = 'open';
      gate.deadlineAt = input.deadlineAt;
      run.state = 'waiting_for_human';
      run.executionState = 'blocked_by_terminal';
      run.blockingMode = 'terminal_input';
      saveSnapshot(run);
      return structuredClone(gate);
    },

    resolveGate(input: { runId: string; gateId: string }) {
      const { run, gate } = getRequiredGate(input.runId, input.gateId);
      if (gate.status !== 'open') {
        throw new Error('只能 resolve 当前处于 open 状态的 human gate。');
      }

      gate.status = 'resolved';
      run.state = 'suspended';
      run.executionState = 'suspended';
      run.blockingMode = 'none';
      saveSnapshot(run);
      return structuredClone(gate);
    },

    rejectGate(input: { runId: string; gateId: string }) {
      const { run, gate } = getRequiredGate(input.runId, input.gateId);
      if (gate.status !== 'open') {
        throw new Error('只能 reject 当前处于 open 状态的 human gate。');
      }

      gate.status = 'rejected';
      run.state = 'suspended';
      run.executionState = 'suspended';
      run.blockingMode = 'none';
      saveSnapshot(run);
      return structuredClone(gate);
    },

    markRunRunning(input: { runId: string; clearGate?: boolean }) {
      const run = getRequiredRun(input.runId);
      run.state = 'running';
      run.executionState = 'running';
      run.blockingMode = 'none';
      if (input.clearGate) {
        run.openGate = null;
      }

      saveSnapshot(run);
      return structuredClone(run);
    },

    markRunCompleted(runId: string) {
      const run = getRequiredRun(runId);
      run.state = 'completed';
      run.executionState = 'completed';
      run.blockingMode = 'none';
      run.openGate = null;
      saveSnapshot(run);
      return structuredClone(run);
    },

    markRunFailed(runId: string) {
      const run = getRequiredRun(runId);
      run.state = 'failed';
      run.executionState = 'failed';
      run.blockingMode = 'none';
      run.openGate = null;
      saveSnapshot(run);
      return structuredClone(run);
    },

    markRunCancelled(runId: string) {
      const run = getRequiredRun(runId);
      run.state = 'cancelled';
      run.executionState = 'cancelled';
      run.blockingMode = 'none';
      run.openGate = null;
      saveSnapshot(run);
      return structuredClone(run);
    },

    getReattachableRun(sessionId: string) {
      const candidates = Array.from(runs.values()).reverse();
      const run = candidates.find(
        (candidate) =>
          candidate.sessionId === sessionId &&
          (candidate.state === 'waiting_for_human' || candidate.state === 'suspended')
      );
      return run ? structuredClone(run) : null;
    },

    getRun(runId: string) {
      const run = runs.get(runId);
      return run ? structuredClone(run) : null;
    },
  };
}
