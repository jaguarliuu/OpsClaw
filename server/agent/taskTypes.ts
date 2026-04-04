import type { AgentApprovalMode } from './agentTypes.js';
import type { HumanGateKind, HumanGateStatus } from './humanGateTypes.js';

export type AgentTaskKind = 'agent_run' | 'session_command' | 'subagent';
export type AgentTaskState =
  | 'queued'
  | 'running'
  | 'waiting_for_human'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentTaskWaitState =
  | {
      kind: 'human_gate';
      gateId: string;
      gateKind: HumanGateKind;
      gateStatus: Extract<HumanGateStatus, 'open' | 'expired'>;
    }
  | {
      kind: 'subagent_run';
      childRunId: string | null;
    };

type AgentTaskRecordBase = {
  taskId: string;
  runId: string;
  parentTaskId: string | null;
  kind: AgentTaskKind;
  title: string;
  sessionId: string | null;
  nodeId: string | null;
  step: number | null;
  state: AgentTaskState;
  waitingOn: AgentTaskWaitState | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
};

export type AgentRunTaskRecord = AgentTaskRecordBase & {
  kind: 'agent_run';
  input: {
    task: string;
    approvalMode: AgentApprovalMode;
    maxSteps: number | null;
  };
  output: {
    finalAnswer: string;
    steps: number;
  } | null;
};

export type SessionCommandTaskRecord = AgentTaskRecordBase & {
  kind: 'session_command';
  sessionId: string;
  input: {
    command: string;
    toolCallId: string | null;
    interactive: boolean;
    maxOutputChars: number;
  };
  output: {
    exitCode: number;
    durationMs: number;
    truncated: boolean;
  } | null;
};

export type SubagentTaskRecord = AgentTaskRecordBase & {
  kind: 'subagent';
  input: {
    objective: string;
    requestedSessionId: string | null;
    delegationMode: 'inherit_session' | 'detached';
  };
  output: {
    childRunId: string | null;
    summary: string | null;
  } | null;
};

export type AgentTaskRecord =
  | AgentRunTaskRecord
  | SessionCommandTaskRecord
  | SubagentTaskRecord;

export type RegisterAgentTaskInput =
  | Omit<
      AgentRunTaskRecord,
      'state' | 'waitingOn' | 'error' | 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt'
    >
  | Omit<
      SessionCommandTaskRecord,
      'state' | 'waitingOn' | 'error' | 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt'
    >
  | Omit<
      SubagentTaskRecord,
      'state' | 'waitingOn' | 'error' | 'createdAt' | 'updatedAt' | 'startedAt' | 'completedAt'
    >;

export type AgentTaskQuery = {
  runId?: string;
  sessionId?: string;
  kind?: AgentTaskKind;
  parentTaskId?: string | null;
  state?: AgentTaskState;
};
