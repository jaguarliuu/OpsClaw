import type { AgentPolicySummary } from './agentTypes.js';
import type {
  OpsClawIntentKind,
  ParameterSource,
  ProtectedParameterName,
} from './controlledExecutionTypes.js';

export type AgentRunState =
  | 'running'
  | 'waiting_for_human'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRunExecutionState =
  | 'running'
  | 'blocked_by_ui_gate'
  | 'blocked_by_terminal'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRunBlockingMode = 'none' | 'ui_gate' | 'terminal_input';

export type HumanGateKind = 'terminal_input' | 'approval' | 'parameter_confirmation';
export type HumanGateStatus = 'open' | 'resolved' | 'rejected' | 'expired';
export type HumanGatePresentationMode = 'inline_ui_action' | 'terminal_wait';

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

export type ParameterConfirmationField = {
  name: ProtectedParameterName;
  label: string;
  value: string;
  required: boolean;
  source: ParameterSource;
};

export type ParameterConfirmationGatePayload = {
  toolCallId: string;
  toolName: 'session.run_command';
  command: string;
  intentKind: OpsClawIntentKind;
  fields: ParameterConfirmationField[];
};

export type HumanGatePayload =
  | TerminalInputGatePayload
  | ApprovalGatePayload
  | ParameterConfirmationGatePayload;
type HumanGateRecordBase = {
  id: string;
  runId: string;
  sessionId: string;
  status: HumanGateStatus;
  reason: string;
  openedAt: number;
  deadlineAt: number | null;
  presentationMode?: HumanGatePresentationMode;
};

export type TerminalInputGateRecord = HumanGateRecordBase & {
  kind: 'terminal_input';
  payload: TerminalInputGatePayload;
};

export type ApprovalGateRecord = HumanGateRecordBase & {
  kind: 'approval';
  payload: ApprovalGatePayload;
};

export type ParameterConfirmationGateRecord = HumanGateRecordBase & {
  kind: 'parameter_confirmation';
  payload: ParameterConfirmationGatePayload;
};

export type HumanGateRecord =
  | TerminalInputGateRecord
  | ApprovalGateRecord
  | ParameterConfirmationGateRecord;
