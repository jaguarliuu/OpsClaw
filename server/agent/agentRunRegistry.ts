import type {
  AgentRunState,
} from './agentTypes.js';
import type { InteractionRequest } from './interactionTypes.js';

export type AgentRunExecutionState =
  | 'running'
  | 'blocked_by_interaction'
  | 'blocked_by_terminal'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRunBlockingMode = 'none' | 'interaction' | 'terminal_wait';

export type AgentRunRecord = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  executionState: AgentRunExecutionState;
  blockingMode: AgentRunBlockingMode;
  activeInteraction: InteractionRequest | null;
};

export type AgentRunSnapshot = AgentRunRecord;

export type RegisterRunInput = Pick<AgentRunRecord, 'runId' | 'sessionId' | 'task'>;
export type AgentRunSnapshotStore = {
  save: (snapshot: AgentRunSnapshot) => void;
};

export type OpenInteractionInput = {
  runId: string;
  sessionId: string;
  request: InteractionRequest;
};

function toExecutionState(request: InteractionRequest): AgentRunExecutionState {
  return request.interactionKind === 'terminal_wait'
    ? 'blocked_by_terminal'
    : request.blockingMode === 'none'
      ? 'running'
      : 'blocked_by_interaction';
}

function toRunBlockingMode(request: InteractionRequest): AgentRunBlockingMode {
  return request.interactionKind === 'terminal_wait'
    ? 'terminal_wait'
    : request.blockingMode === 'none'
      ? 'none'
      : 'interaction';
}

function toRunState(request: InteractionRequest): AgentRunState {
  return toExecutionState(request) === 'running' ? 'running' : 'waiting_for_human';
}

export function createAgentRunRegistry(options?: {
  snapshotStore?: AgentRunSnapshotStore;
}) {
  const runs = new Map<string, AgentRunRecord>();

  function toSnapshot(run: AgentRunRecord): AgentRunSnapshot {
    return structuredClone(run);
  }

  function saveSnapshot(run: AgentRunRecord) {
    options?.snapshotStore?.save(toSnapshot(run));
  }

  function getRequiredRun(runId: string) {
    const run = runs.get(runId);
    if (!run) {
      throw new Error('Agent run 不存在。');
    }

    return run;
  }

  function getRequiredInteraction(runId: string, interactionId: string) {
    const run = getRequiredRun(runId);
    if (!run.activeInteraction || run.activeInteraction.id !== interactionId) {
      throw new Error('指定 interaction 不存在。');
    }

    return { run, interaction: run.activeInteraction };
  }

  function openInteractionInternal(input: OpenInteractionInput) {
    const run = getRequiredRun(input.runId);
    if (run.state !== 'running') {
      throw new Error('只有处于 running 状态的 run 才能打开新的 interaction。');
    }
    if (run.sessionId !== input.sessionId) {
      throw new Error('指定 session 与当前 run 不匹配。');
    }
    if (run.activeInteraction?.status === 'open') {
      throw new Error('当前 run 已存在未完成的 interaction。');
    }
    if (input.request.runId !== input.runId || input.request.sessionId !== input.sessionId) {
      throw new Error('interaction 绑定的 run/session 与目标 run 不一致。');
    }
    if (input.request.status !== 'open') {
      throw new Error('新打开的 interaction 必须是 open 状态。');
    }
    if (input.request.blockingMode === 'none') {
      throw new Error('run registry 只接受会阻断执行的 interaction。');
    }

    const request = structuredClone(input.request);
    run.state = toRunState(request);
    run.executionState = toExecutionState(request);
    run.blockingMode = toRunBlockingMode(request);
    run.activeInteraction = request;
    saveSnapshot(run);
    return structuredClone(request);
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
        activeInteraction: null,
      });
      saveSnapshot(getRequiredRun(input.runId));
    },

    openInteraction(input: OpenInteractionInput) {
      return openInteractionInternal(input);
    },

    expireInteraction(input: { runId: string; interactionId: string }) {
      const { run, interaction } = getRequiredInteraction(input.runId, input.interactionId);
      if (interaction.status !== 'open') {
        throw new Error('只能 expire 当前处于 open 状态的 interaction。');
      }

      interaction.status = 'expired';
      run.state = 'suspended';
      run.executionState = 'suspended';
      run.blockingMode = 'none';
      saveSnapshot(run);
    },

    markInteractionReopened(input: {
      runId: string;
      interactionId: string;
      deadlineAt: number | null;
    }) {
      const { run, interaction } = getRequiredInteraction(input.runId, input.interactionId);
      if (interaction.interactionKind !== 'terminal_wait') {
        throw new Error('只有 terminal_wait interaction 支持重新进入等待。');
      }
      if (interaction.status !== 'expired') {
        throw new Error('只有处于 expired 状态的 interaction 才能重新等待。');
      }

      interaction.status = 'open';
      interaction.deadlineAt = input.deadlineAt;
      run.state = 'waiting_for_human';
      run.executionState = 'blocked_by_terminal';
      run.blockingMode = 'terminal_wait';
      saveSnapshot(run);
      return structuredClone(interaction);
    },

    resolveInteraction(input: { runId: string; interactionId: string }) {
      const { run, interaction } = getRequiredInteraction(input.runId, input.interactionId);
      if (interaction.status !== 'open') {
        throw new Error('只能 resolve 当前处于 open 状态的 interaction。');
      }

      interaction.status = 'resolved';
      run.state = 'suspended';
      run.executionState = 'suspended';
      run.blockingMode = 'none';
      saveSnapshot(run);
      return structuredClone(interaction);
    },

    rejectInteraction(input: { runId: string; interactionId: string }) {
      const { run, interaction } = getRequiredInteraction(input.runId, input.interactionId);
      if (interaction.status !== 'open') {
        throw new Error('只能 reject 当前处于 open 状态的 interaction。');
      }

      interaction.status = 'rejected';
      run.state = 'suspended';
      run.executionState = 'suspended';
      run.blockingMode = 'none';
      saveSnapshot(run);
      return structuredClone(interaction);
    },

    markRunRunning(input: { runId: string; clearInteraction?: boolean }) {
      const run = getRequiredRun(input.runId);
      run.state = 'running';
      run.executionState = 'running';
      run.blockingMode = 'none';
      if (input.clearInteraction) {
        run.activeInteraction = null;
      }

      saveSnapshot(run);
      return structuredClone(run);
    },

    markRunCompleted(runId: string) {
      const run = getRequiredRun(runId);
      run.state = 'completed';
      run.executionState = 'completed';
      run.blockingMode = 'none';
      run.activeInteraction = null;
      saveSnapshot(run);
      return structuredClone(run);
    },

    markRunFailed(runId: string) {
      const run = getRequiredRun(runId);
      run.state = 'failed';
      run.executionState = 'failed';
      run.blockingMode = 'none';
      run.activeInteraction = null;
      saveSnapshot(run);
      return structuredClone(run);
    },

    markRunCancelled(runId: string) {
      const run = getRequiredRun(runId);
      run.state = 'cancelled';
      run.executionState = 'cancelled';
      run.blockingMode = 'none';
      run.activeInteraction = null;
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
      return run ? toSnapshot(run) : null;
    },

    getRun(runId: string) {
      const run = runs.get(runId);
      return run ? toSnapshot(run) : null;
    },
  };
}
