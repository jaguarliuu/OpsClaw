import type { HumanGateRecord } from './types.agent';
import type { AgentSessionLock } from './types';

type CreateAgentSessionModelOptions = {
  activeGate: HumanGateRecord | null;
  pendingContinuationRunId: string | null;
};

export type AgentSessionModel = {
  hasPendingContinuation: boolean;
  isInteractionLocked: boolean;
  canStartAgentRun: boolean;
  canClearAgentItems: boolean;
  sessionLock: AgentSessionLock | null;
};

export function getAgentSessionLockFromGate(gate: HumanGateRecord | null): AgentSessionLock | null {
  if (
    gate === null ||
    gate.kind !== 'terminal_input' ||
    (gate.status !== 'open' && gate.status !== 'expired')
  ) {
    return null;
  }

  return {
    sessionId: gate.sessionId,
    runId: gate.runId,
    gateId: gate.id,
    status: gate.status,
    reason: gate.reason,
    command: gate.payload.command,
  };
}

export function createAgentSessionModel({
  activeGate,
  pendingContinuationRunId,
}: CreateAgentSessionModelOptions): AgentSessionModel {
  const hasPendingContinuation = pendingContinuationRunId !== null;
  const isInteractionLocked = activeGate !== null || hasPendingContinuation;

  return {
    hasPendingContinuation,
    isInteractionLocked,
    canStartAgentRun: !isInteractionLocked,
    canClearAgentItems: !isInteractionLocked,
    sessionLock: getAgentSessionLockFromGate(activeGate),
  };
}

export function getSessionAgentSessionLock(
  model: AgentSessionModel,
  sessionId: string
): AgentSessionLock | null {
  return model.sessionLock?.sessionId === sessionId ? model.sessionLock : null;
}

export function isAgentSessionLocked(lock: AgentSessionLock | null): lock is AgentSessionLock {
  return lock !== null;
}

export function getAgentSessionLockBannerText(lock: AgentSessionLock) {
  if (lock.status === 'expired') {
    return '该终端上的 Agent 交互等待已暂停，可在 AI 面板中继续等待。';
  }

  return '该终端正在被 Agent 用于交互命令，请在此完成输入。';
}
