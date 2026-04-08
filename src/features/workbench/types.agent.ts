export type AgentApprovalMode = 'auto-readonly' | 'manual-sensitive';

export type AgentPolicySummary = {
  action: 'deny' | 'require_approval';
  matches: Array<{
    ruleId: string;
    title: string;
    severity: 'medium' | 'high' | 'critical';
    reason: string;
    matchedText?: string;
  }>;
};

export type AgentRunState =
  | 'running'
  | 'waiting_for_human'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRunExecutionState =
  | 'running'
  | 'blocked_by_interaction'
  | 'blocked_by_ui_gate'
  | 'blocked_by_terminal'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRunBlockingMode =
  | 'none'
  | 'interaction'
  | 'ui_gate'
  | 'terminal_wait'
  | 'terminal_input';

export type InteractionStatus = 'open' | 'submitted' | 'resolved' | 'rejected' | 'expired';
export type InteractionKind =
  | 'collect_input'
  | 'approval'
  | 'danger_confirm'
  | 'terminal_wait'
  | 'inform';
export type InteractionRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type InteractionBlockingMode = 'none' | 'soft_block' | 'hard_block';

export type InteractionField =
  | { type: 'display'; key: string; label?: string; value: string }
  | {
      type: 'text';
      key: string;
      label: string;
      required?: boolean;
      value?: string;
      placeholder?: string;
    }
  | {
      type: 'password';
      key: string;
      label: string;
      required?: boolean;
      value?: string;
      placeholder?: string;
    }
  | {
      type: 'textarea';
      key: string;
      label: string;
      required?: boolean;
      value?: string;
      placeholder?: string;
    }
  | {
      type: 'single_select';
      key: string;
      label: string;
      required?: boolean;
      options: Array<{ label: string; value: string; description?: string }>;
      value?: string;
    }
  | {
      type: 'multi_select';
      key: string;
      label: string;
      required?: boolean;
      options: Array<{ label: string; value: string; description?: string }>;
      value?: string[];
    }
  | { type: 'confirm'; key: string; label: string; required?: boolean; value?: boolean };

export type InteractionAction = {
  id: string;
  label: string;
  kind: 'submit' | 'approve' | 'reject' | 'cancel' | 'continue_waiting' | 'acknowledge';
  style: 'primary' | 'secondary' | 'danger';
};

export type InteractionRequest = {
  id: string;
  runId: string;
  sessionId: string;
  status: InteractionStatus;
  interactionKind: InteractionKind;
  riskLevel: InteractionRiskLevel;
  blockingMode: InteractionBlockingMode;
  title: string;
  message: string;
  schemaVersion: 'v1';
  fields: InteractionField[];
  actions: InteractionAction[];
  openedAt: number;
  deadlineAt: number | null;
  metadata: Record<string, unknown>;
};

export type OpsClawIntentKind =
  | 'diagnostic.readonly'
  | 'routine.safe_change'
  | 'service.lifecycle_change'
  | 'filesystem.write'
  | 'filesystem.delete'
  | 'package_management'
  | 'user_management'
  | 'permission_change'
  | 'credential_change';

export type ParameterSource =
  | 'user_explicit'
  | 'user_confirmed'
  | 'system_observed'
  | 'agent_inferred';

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
  name: string;
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

export type AgentRunSnapshot = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  executionState: AgentRunExecutionState;
  blockingMode: AgentRunBlockingMode;
  activeInteraction?: InteractionRequest | null;
  openGate?: HumanGateRecord | null;
};

export type ToolExecutionEnvelope = {
  toolName: string;
  toolCallId: string;
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  meta: {
    startedAt: number;
    completedAt: number;
    durationMs: number;
    truncated?: boolean;
    approvalRequired?: boolean;
    policy?: AgentPolicySummary;
  };
};

export type AgentStreamEvent =
  | {
      type: 'run_started';
      runId: string;
      sessionId: string;
      task: string;
      timestamp: number;
    }
  | {
      type: 'run_state_changed';
      runId: string;
      state: AgentRunState;
      executionState?: AgentRunExecutionState;
      blockingMode?: AgentRunBlockingMode;
      timestamp: number;
    }
  | {
      type: 'assistant_message_delta';
      runId: string;
      delta: string;
      step: number;
      timestamp: number;
    }
  | {
      type: 'assistant_message';
      runId: string;
      text: string;
      step: number;
      timestamp: number;
    }
  | {
      type: 'tool_call';
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      timestamp: number;
    }
  | {
      type: 'tool_execution_started';
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      timestamp: number;
    }
  | {
      type: 'tool_execution_finished';
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      result: ToolExecutionEnvelope;
      timestamp: number;
    }
  | {
      type: 'approval_required';
      runId: string;
      step: number;
      toolCallId: string;
      toolName: string;
      reason: string;
      policy?: AgentPolicySummary;
      timestamp: number;
    }
  | {
      type: 'human_gate_opened';
      runId: string;
      gate: HumanGateRecord;
      timestamp: number;
    }
  | {
      type: 'human_gate_resolved';
      runId: string;
      gate: HumanGateRecord;
      timestamp: number;
    }
  | {
      type: 'human_gate_rejected';
      runId: string;
      gate: HumanGateRecord;
      timestamp: number;
    }
  | {
      type: 'human_gate_expired';
      runId: string;
      gate: HumanGateRecord;
      timestamp: number;
    }
  | {
      type: 'interaction_requested';
      runId: string;
      request: InteractionRequest;
      timestamp: number;
    }
  | {
      type: 'interaction_updated';
      runId: string;
      request: InteractionRequest;
      timestamp: number;
    }
  | {
      type: 'interaction_resolved';
      runId: string;
      request: InteractionRequest;
      timestamp: number;
    }
  | {
      type: 'interaction_rejected';
      runId: string;
      request: InteractionRequest;
      timestamp: number;
    }
  | {
      type: 'interaction_expired';
      runId: string;
      request: InteractionRequest;
      timestamp: number;
    }
  | {
      type: 'warning';
      runId: string;
      message: string;
      step?: number;
      timestamp: number;
    }
  | {
      type: 'run_completed';
      runId: string;
      finalAnswer: string;
      steps: number;
      timestamp: number;
    }
  | {
      type: 'run_failed';
      runId: string;
      error: string;
      step?: number;
      timestamp: number;
    }
  | {
      type: 'run_cancelled';
      runId: string;
      step?: number;
      timestamp: number;
    };

export type AgentTimelineItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; step: number }
  | { id: string; kind: 'human_gate'; runId: string; gate: HumanGateRecord }
  | {
      id: string;
      kind: 'tool_call';
      step: number;
      toolName: string;
      arguments: Record<string, unknown>;
    }
  | {
      id: string;
      kind: 'tool_result';
      step: number;
      toolName: string;
      result: ToolExecutionEnvelope;
    }
  | { id: string; kind: 'warning'; text: string; step?: number; policy?: AgentPolicySummary }
  | { id: string; kind: 'final'; text: string; steps: number }
  | { id: string; kind: 'status'; text: string };

export function parseAgentStreamEvent(payload: unknown): AgentStreamEvent {
  const value: unknown =
    typeof payload === 'string'
      ? (JSON.parse(payload) as unknown)
      : payload;

  if (
    value === null ||
    typeof value !== 'object' ||
    typeof (value as { type?: unknown }).type !== 'string'
  ) {
    throw new Error('非法 Agent 事件。');
  }

  return value as AgentStreamEvent;
}
