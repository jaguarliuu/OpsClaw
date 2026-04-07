import type { Static, Tool, TSchema } from '@mariozechner/pi-ai';

import type { AgentApprovalMode, AgentStreamEvent, ToolExecutionEnvelope } from './agentTypes.js';
import type { EffectiveOpsClawRules, ProtectedParameterName } from './controlledExecutionTypes.js';
import type { FileMemoryStore } from './fileMemoryStore.js';
import type {
  ApprovalGatePayload,
  ParameterConfirmationGatePayload,
  TerminalInputGatePayload,
} from './humanGateTypes.js';
import type { SessionRegistry } from './sessionRegistry.js';

export type ToolRiskLevel = 'safe' | 'caution' | 'dangerous';
export type ToolCategory =
  | 'session'
  | 'filesystem'
  | 'network'
  | 'database'
  | 'orchestration'
  | 'system'
  | 'custom';

export type ToolConcurrencyMode = 'serial' | 'parallel-safe' | 'session-exclusive';

export type ToolAvailabilityContext = {
  sessionId: string | null;
};

export type ToolExecutionContext = {
  runId: string;
  userTask: string;
  sessionId: string | null;
  sessionLabel?: string;
  sessionGroupName: string | null;
  step: number;
  approvalMode: AgentApprovalMode;
  maxCommandOutputChars: number;
  effectiveRules: EffectiveOpsClawRules;
  signal: AbortSignal;
  capabilities: {
    sessions: SessionRegistry;
    fileMemory: FileMemoryStore;
  };
  emit: (event: AgentStreamEvent) => void;
};

export type ToolPolicyMatch = {
  ruleId: string;
  title: string;
  severity: 'medium' | 'high' | 'critical';
  reason: string;
  matchedText?: string;
};

export type ToolDefinition<
  TParameters extends TSchema = TSchema,
  TArgs = Static<TParameters>,
  TResult = unknown,
> = {
  name: string;
  description: string;
  parameters: TParameters;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  concurrencyMode: ToolConcurrencyMode;
  version: string;
  tags?: string[];
  enabledByDefault?: boolean;
  isAvailable?: (ctx: ToolAvailabilityContext) => boolean | Promise<boolean>;
  formatResult?: (result: TResult, ctx: ToolExecutionContext) => ToolExecutionEnvelope;
  summarizeForTimeline?: (result: TResult) => string | null;
  requiresApproval?: (args: TArgs, ctx: ToolExecutionContext) => boolean;
};

export type ToolHandler<
  TParameters extends TSchema = TSchema,
  TArgs = Static<TParameters>,
  TResult = unknown,
> = {
  definition: ToolDefinition<TParameters, TArgs, TResult>;
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<TResult>;
};

export type ToolProvider = {
  id: string;
  version: string;
  register: (registry: ToolRegistry) => void;
};

export interface ToolRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(tool: ToolHandler<TSchema, any, unknown>): void;
  registerProvider(provider: ToolProvider): void;
  get(name: string): ToolHandler | undefined;
  listAll(): ToolHandler[];
  listAvailable(ctx: ToolAvailabilityContext): Promise<ToolHandler[]>;
  listPiTools(ctx: ToolAvailabilityContext): Promise<Tool[]>;
}

export type ToolPolicyDecision =
  | { kind: 'allow'; matches?: ToolPolicyMatch[] }
  | { kind: 'deny'; reason: string; matches: ToolPolicyMatch[] }
  | { kind: 'require_approval'; reason: string; matches: ToolPolicyMatch[] };

export type ToolPauseOutcome =
  | {
      kind: 'pause';
      gateKind: 'terminal_input';
      reason: string;
      payload: TerminalInputGatePayload;
      continuation: {
        waitForCompletion: (signal?: AbortSignal) => Promise<ToolExecutionEnvelope>;
        getSettledEnvelope: () => ToolExecutionEnvelope | null;
      };
    }
  | {
      kind: 'pause';
      gateKind: 'approval';
      reason: string;
      payload: ApprovalGatePayload;
      continuation: {
        resume: (signal?: AbortSignal) => Promise<ToolExecutionEnvelope | ToolPauseOutcome>;
        reject: () => ToolExecutionEnvelope;
      };
    }
  | {
      kind: 'pause';
      gateKind: 'parameter_confirmation';
      reason: string;
      payload: ParameterConfirmationGatePayload;
      continuation: {
        resume: (
          fields: Partial<Record<ProtectedParameterName, string>>,
          signal?: AbortSignal
        ) => Promise<ToolExecutionEnvelope | ToolPauseOutcome>;
        reject: () => ToolExecutionEnvelope;
      };
    };

export type ToolExecutionResult =
  | { kind: 'success'; envelope: ToolExecutionEnvelope }
  | { kind: 'failure'; envelope: ToolExecutionEnvelope }
  | ToolPauseOutcome;
