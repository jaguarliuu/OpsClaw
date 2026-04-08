import type { AgentRunSnapshot, HumanGateRecord } from './types.agent';

export function isUiResolvableGate(gate: HumanGateRecord | null): boolean {
  return gate?.presentationMode === 'inline_ui_action';
}

export function isTerminalWaitGate(gate: HumanGateRecord | null): boolean {
  return gate?.presentationMode === 'terminal_wait';
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
