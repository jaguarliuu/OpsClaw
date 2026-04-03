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
type HumanGateRecordBase = {
  id: string;
  runId: string;
  sessionId: string;
  status: HumanGateStatus;
  reason: string;
  openedAt: number;
  deadlineAt: number;
};

export type TerminalInputGateRecord = HumanGateRecordBase & {
  kind: 'terminal_input';
  payload: TerminalInputGatePayload;
};

export type ApprovalGateRecord = HumanGateRecordBase & {
  kind: 'approval';
  payload: ApprovalGatePayload;
};

export type HumanGateRecord = TerminalInputGateRecord | ApprovalGateRecord;
