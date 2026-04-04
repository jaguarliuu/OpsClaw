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

export type AgentRunSnapshot = {
  runId: string;
  sessionId: string;
  task: string;
  state: AgentRunState;
  openGate: HumanGateRecord | null;
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
  const value =
    typeof payload === 'string'
      ? JSON.parse(payload)
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
