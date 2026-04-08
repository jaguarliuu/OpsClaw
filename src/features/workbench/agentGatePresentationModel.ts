import type { AgentRunSnapshot, InteractionRequest } from './types.agent';

export function isUiResolvableInteraction(interaction: InteractionRequest | null): boolean {
  return interaction !== null && interaction.interactionKind !== 'terminal_wait';
}

export function isTerminalWaitInteraction(interaction: InteractionRequest | null): boolean {
  return interaction?.interactionKind === 'terminal_wait';
}

export function getAgentRunDisplayState(
  snapshot: Pick<AgentRunSnapshot, 'executionState' | 'blockingMode' | 'state'>
) {
  if (snapshot.blockingMode === 'interaction') {
    return 'awaiting_user_action';
  }

  if (snapshot.blockingMode === 'terminal_wait') {
    return 'waiting_terminal';
  }

  return snapshot.state;
}
