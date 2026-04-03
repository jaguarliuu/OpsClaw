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
