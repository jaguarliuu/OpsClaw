import type { StoredLlmProvider } from '../llmProviderStore.js';

import type {
  AgentRunState,
  HumanGateRecord,
} from './humanGateTypes.js';
import type { InteractionRequest } from './interactionTypes.js';

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

export type CreateAgentRunInput = {
  providerId: string;
  provider: StoredLlmProvider;
  model: string;
  task: string;
  sessionId: string;
  approvalMode?: AgentApprovalMode;
  maxSteps?: number;
  maxCommandOutputChars?: number;
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
