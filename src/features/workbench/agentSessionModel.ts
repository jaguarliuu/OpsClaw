import type { InteractionRequest } from './types.agent';
import type { AgentSessionLock } from './types';

type CreateAgentSessionModelOptions = {
  activeInteraction?: InteractionRequest | null;
  pendingContinuationRunId: string | null;
};

export type AgentSessionModel = {
  hasPendingContinuation: boolean;
  isInteractionLocked: boolean;
  canStartAgentRun: boolean;
  canClearAgentItems: boolean;
  sessionLock: AgentSessionLock | null;
};

export function getAgentSessionLockFromInteraction(
  interaction: InteractionRequest | null
): AgentSessionLock | null {
  if (
    interaction === null ||
    interaction.interactionKind !== 'terminal_wait' ||
    (interaction.status !== 'open' && interaction.status !== 'expired')
  ) {
    return null;
  }

  return {
    sessionId: interaction.sessionId,
    runId: interaction.runId,
    gateId: interaction.id,
    status: interaction.status,
    reason: interaction.message,
    command:
      typeof interaction.metadata.commandPreview === 'string'
        ? interaction.metadata.commandPreview
        : interaction.title,
  };
}

export function createAgentSessionModel({
  activeInteraction = null,
  pendingContinuationRunId,
}: CreateAgentSessionModelOptions): AgentSessionModel {
  const hasPendingContinuation = pendingContinuationRunId !== null;
  const isInteractionLocked = activeInteraction !== null || hasPendingContinuation;

  return {
    hasPendingContinuation,
    isInteractionLocked,
    canStartAgentRun: !isInteractionLocked,
    canClearAgentItems: !isInteractionLocked,
    sessionLock: getAgentSessionLockFromInteraction(activeInteraction),
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
