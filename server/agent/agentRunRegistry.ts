import { randomUUID } from 'node:crypto';

import type {
  AgentRunState,
  ApprovalGatePayload,
  HumanGateRecord,
  HumanGateStatus,
  ParameterConfirmationGatePayload,
  TerminalInputGatePayload,
} from './humanGateTypes.js';
import type {
  InteractionRequest,
  InteractionStatus,
} from './interactionTypes.js';

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

export type RegisterRunInput = Pick<AgentRunRecord, 'runId' | 'sessionId' | 'task'>;
export type AgentRunSnapshotStore = {
  save: (snapshot: AgentRunRecord) => void;
};

export type OpenInteractionInput = {
  runId: string;
  sessionId: string;
  request: InteractionRequest;
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

const LEGACY_GATE_KIND_KEY = '__legacyGateKind';
const LEGACY_GATE_PAYLOAD_KEY = '__legacyGatePayload';
const LEGACY_GATE_REASON_KEY = '__legacyGateReason';

function toExecutionState(request: InteractionRequest): AgentRunExecutionState {
  return request.interactionKind === 'terminal_wait'
    ? 'blocked_by_terminal'
    : request.blockingMode === 'none'
      ? 'running'
      : 'blocked_by_interaction';
}

function toRunBlockingMode(request: InteractionRequest): AgentRunBlockingMode {
  return request.interactionKind === 'terminal_wait' ? 'terminal_wait' : 'interaction';
}

function toLegacyGateStatus(status: InteractionStatus): HumanGateStatus {
  if (status === 'submitted') {
    return 'open';
  }

  return status;
}

function createLegacyInteractionRequest(input: OpenHumanGateInput): InteractionRequest {
  const interactionKind =
    input.kind === 'terminal_input'
      ? 'terminal_wait'
      : input.kind === 'approval'
        ? 'approval'
        : 'collect_input';

  return {
    id: randomUUID(),
    runId: input.runId,
    sessionId: input.sessionId,
    status: 'open',
    interactionKind,
    riskLevel: input.kind === 'approval' ? 'high' : 'medium',
    blockingMode: 'hard_block',
    title:
      input.kind === 'terminal_input'
        ? '等待终端交互'
        : input.kind === 'approval'
          ? '操作审批'
          : '参数确认',
    message: input.reason,
    schemaVersion: 'v1',
    fields:
      input.kind === 'terminal_input'
        ? [{ type: 'display', key: 'command', value: input.payload.command }]
        : [],
    actions:
      input.kind === 'terminal_input'
        ? [
            {
              id: 'continue_waiting',
              label: '继续等待',
              kind: 'continue_waiting',
              style: 'primary',
            },
            { id: 'cancel', label: '取消', kind: 'cancel', style: 'secondary' },
          ]
        : [
            { id: 'approve', label: '继续执行', kind: 'approve', style: 'danger' },
            { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
          ],
    openedAt: Date.now(),
    deadlineAt: input.deadlineAt,
    metadata: {
      [LEGACY_GATE_KIND_KEY]: input.kind,
      [LEGACY_GATE_PAYLOAD_KEY]: input.payload,
      [LEGACY_GATE_REASON_KEY]: input.reason,
    },
  };
}

function toLegacyGateRecord(request: InteractionRequest): HumanGateRecord {
  const kind = request.metadata[LEGACY_GATE_KIND_KEY];
  const payload = request.metadata[LEGACY_GATE_PAYLOAD_KEY];
  const reason = request.metadata[LEGACY_GATE_REASON_KEY];

  if (
    kind !== 'terminal_input' &&
    kind !== 'approval' &&
    kind !== 'parameter_confirmation'
  ) {
    throw new Error('当前 interaction 不包含 legacy human gate 信息。');
  }

  const base = {
    id: request.id,
    runId: request.runId,
    sessionId: request.sessionId,
    status: toLegacyGateStatus(request.status),
    reason: typeof reason === 'string' ? reason : request.message,
    openedAt: request.openedAt,
    deadlineAt: request.deadlineAt,
    presentationMode:
      request.interactionKind === 'terminal_wait' ? 'terminal_wait' : 'inline_ui_action',
  } as const;

  if (kind === 'terminal_input') {
    return {
      ...base,
      kind,
      payload: payload as TerminalInputGatePayload,
    };
  }

  if (kind === 'approval') {
    return {
      ...base,
      kind,
      payload: payload as ApprovalGatePayload,
    };
  }

  return {
    ...base,
    kind,
    payload: payload as ParameterConfirmationGatePayload,
  };
}

export function createAgentRunRegistry(options?: {
  snapshotStore?: AgentRunSnapshotStore;
}) {
  const runs = new Map<string, AgentRunRecord>();

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

    const request = structuredClone(input.request);
    run.state = 'waiting_for_human';
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

    markRunRunning(input: { runId: string; clearInteraction?: boolean; clearGate?: boolean }) {
      const run = getRequiredRun(input.runId);
      run.state = 'running';
      run.executionState = 'running';
      run.blockingMode = 'none';
      if (input.clearInteraction || input.clearGate) {
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
      return run ? structuredClone(run) : null;
    },

    getRun(runId: string) {
      const run = runs.get(runId);
      return run ? structuredClone(run) : null;
    },

    // Legacy human gate compatibility layer
    openGate(input: OpenHumanGateInput) {
      const request = createLegacyInteractionRequest(input);
      const opened = openInteractionInternal({
        runId: input.runId,
        sessionId: input.sessionId,
        request,
      });
      return toLegacyGateRecord(opened);
    },

    expireGate(input: { runId: string; gateId: string }) {
      this.expireInteraction({ runId: input.runId, interactionId: input.gateId });
    },

    markGateReopened(input: { runId: string; gateId: string; deadlineAt: number }) {
      const reopened = this.markInteractionReopened({
        runId: input.runId,
        interactionId: input.gateId,
        deadlineAt: input.deadlineAt,
      });
      return toLegacyGateRecord(reopened);
    },

    resolveGate(input: { runId: string; gateId: string }) {
      const resolved = this.resolveInteraction({
        runId: input.runId,
        interactionId: input.gateId,
      });
      return toLegacyGateRecord(resolved);
    },

    rejectGate(input: { runId: string; gateId: string }) {
      const rejected = this.rejectInteraction({
        runId: input.runId,
        interactionId: input.gateId,
      });
      return toLegacyGateRecord(rejected);
    },
  };
}
