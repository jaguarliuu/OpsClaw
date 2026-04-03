import type { AgentPolicySummary } from './agentTypes.js';

export type AgentRunState =
  | 'running'
  | 'waiting_for_human'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type HumanGateKind = 'terminal_input' | 'approval';
export type HumanGateStatus = 'open' | 'resolved' | 'rejected' | 'expired';

export type TerminalInputGatePayload = {
  toolCallId: string;
  toolName: 'session.run_command';
  command: string;
  sessionLabel?: string;
  timeoutMs: number;
};

export type ApprovalGatePayload = {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  policy: AgentPolicySummary;
};

export type HumanGatePayload = TerminalInputGatePayload | ApprovalGatePayload;

export type HumanGateRecord = {
  id: string;
  runId: string;
  sessionId: string;
  kind: HumanGateKind;
  status: HumanGateStatus;
  reason: string;
  openedAt: number;
  deadlineAt: number;
  payload: HumanGatePayload;
};
