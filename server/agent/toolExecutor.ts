import type { ToolCall } from '@mariozechner/pi-ai';

import type { AgentPolicySummary, ToolExecutionEnvelope } from './agentTypes.js';
import type {
  InteractionAction,
  InteractionBlockingMode,
  InteractionField,
  InteractionKind,
  InteractionRiskLevel,
} from './interactionTypes.js';
import type { ParameterConfirmationField } from './interactionPayloadTypes.js';
import { logAgent } from './logger.js';
import { buildSessionCommandPlan } from './sessionCommandPlanner.js';
import { evaluateSessionCommandPolicy } from './commandPolicy.js';
import { evaluateToolPolicy } from './toolPolicy.js';
import type { ProtectedParameterName } from './controlledExecutionTypes.js';
import type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolHandler,
  ToolPauseOutcome,
  ToolRegistry,
} from './toolTypes.js';

const TERMINAL_INPUT_POLL_INTERVAL_MS = 25;
const DEFAULT_TERMINAL_INPUT_TIMEOUT_MS = 300_000;
const PARAMETER_LABELS: Record<ProtectedParameterName, string> = {
  username: '用户名',
  password: '密码',
  sudo_policy: 'sudo 策略',
  target_path: '目标路径',
  target_service: '目标服务',
  write_content: '写入内容',
  delete_scope: '删除范围',
  package_name: '软件包名',
};

function emitToolExecutionStarted(
  ctx: ToolExecutionContext,
  toolCallId: string,
  toolName: string
) {
  logAgent('tool_execution_started', {
    runId: ctx.runId,
    step: ctx.step,
    toolCallId,
    toolName,
  });
  ctx.emit({
    type: 'tool_execution_started',
    runId: ctx.runId,
    step: ctx.step,
    toolCallId,
    toolName,
    timestamp: Date.now(),
  });
}

function createContinuationSignalController(initialSignal: AbortSignal) {
  const controller = new AbortController();
  let cleanup: (() => void) | null = null;

  const release = () => {
    cleanup?.();
    cleanup = null;
  };

  const bind = (signal?: AbortSignal) => {
    release();
    if (!signal || controller.signal.aborted) {
      return;
    }

    if (signal.aborted) {
      controller.abort();
      return;
    }

    const handleAbort = () => {
      release();
      controller.abort();
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    cleanup = () => {
      signal.removeEventListener('abort', handleAbort);
    };
  };

  bind(initialSignal);

  return {
    signal: controller.signal,
    bind,
    release,
  };
}

function buildErrorEnvelope(
  toolName: string,
  toolCallId: string,
  message: string,
  startedAt: number,
  code = 'tool_execution_failed',
  options?: { retryable?: boolean; approvalRequired?: boolean; policy?: AgentPolicySummary }
): ToolExecutionEnvelope {
  const completedAt = Date.now();

  return {
    toolName,
    toolCallId,
    ok: false,
    error: {
      code,
      message,
      retryable: options?.retryable ?? false,
    },
    meta: {
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      approvalRequired: options?.approvalRequired,
      policy: options?.policy,
    },
  };
}

function isSessionCommandArgs(
  args: unknown
): args is {
  sessionId: string;
  command: string;
  timeoutMs?: number;
  reason?: string;
} {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof (args as { sessionId?: unknown }).sessionId === 'string' &&
    typeof (args as { command?: unknown }).command === 'string'
  );
}

function toParameterConfirmationField(input: {
  name: ProtectedParameterName;
  value: string;
  source: ParameterConfirmationField['source'];
}): ParameterConfirmationField {
  return {
    name: input.name,
    label: PARAMETER_LABELS[input.name],
    value: input.value,
    required: true,
    source: input.source,
  };
}

function applyConfirmedParameters(
  command: string,
  fields: ParameterConfirmationField[],
  confirmedFields: Partial<Record<ProtectedParameterName, string>>
) {
  let nextCommand = command;

  for (const field of fields) {
    const confirmedValue = confirmedFields[field.name];
    if (!confirmedValue || confirmedValue === field.value) {
      continue;
    }

    nextCommand = nextCommand.replace(field.value, confirmedValue);
  }

  return nextCommand;
}

function shouldDeferPlannerApprovalToTerminalInput(input: {
  approvalMode: ToolExecutionContext['approvalMode'];
  command: string;
  extractedParameterCount: number;
}) {
  return (
    input.approvalMode === 'auto-readonly' &&
    input.extractedParameterCount === 0 &&
    /\bpasswd\b/i.test(input.command)
  );
}

function asAbortSignal(value: unknown): AbortSignal | undefined {
  return value instanceof AbortSignal ? value : undefined;
}

type SessionCommandExecutionState = {
  confirmedFields?: Partial<Record<ProtectedParameterName, string>>;
  plannerApprovalGranted?: boolean;
  policyApprovalGranted?: boolean;
};

export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry) {}

  async executeToolCall(
    toolCall: ToolCall,
    args: unknown,
    ctx: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const canonicalToolName = this.registry.resolveCanonicalToolName(toolCall.name);
    const handler = canonicalToolName ? this.registry.get(canonicalToolName) : undefined;
    const startedAt = Date.now();
    logAgent('tool_execution_requested', {
      runId: ctx.runId,
      step: ctx.step,
      toolCallId: toolCall.id,
      toolName: canonicalToolName ?? toolCall.name,
    });

    if (!handler) {
      logAgent('tool_execution_missing_handler', {
        runId: ctx.runId,
        step: ctx.step,
        toolCallId: toolCall.id,
        toolName: canonicalToolName ?? toolCall.name,
      });
      return {
        kind: 'failure',
        envelope: buildErrorEnvelope(
          canonicalToolName ?? toolCall.name,
          toolCall.id,
          `未找到工具：${canonicalToolName ?? toolCall.name}`,
          startedAt,
          'tool_not_found'
        ),
      };
    }

    return this.executeHandler(handler, toolCall.id, args, ctx, startedAt);
  }

  private async executeHandler(
    handler: ToolHandler,
    toolCallId: string,
    args: unknown,
    ctx: ToolExecutionContext,
    startedAt: number
  ): Promise<ToolExecutionResult> {
    if (handler.definition.name === 'session.run_command') {
      return this.wrapExecutionResult(
        await this.executePlannedSessionCommand(handler, toolCallId, args, ctx, startedAt)
      );
    }

    if (handler.definition.name === 'interaction.request') {
      return this.createUserInteractionPause(toolCallId, args, startedAt);
    }

    const decision = evaluateToolPolicy(handler, args, ctx);
    logAgent('tool_policy_decision', {
      runId: ctx.runId,
      step: ctx.step,
      toolCallId,
      toolName: handler.definition.name,
      decision: decision.kind,
      reason: 'reason' in decision ? decision.reason : undefined,
    });

    if (decision.kind === 'deny') {
      const policy: AgentPolicySummary = {
        action: 'deny',
        matches: decision.matches,
      };
      return {
        kind: 'failure',
        envelope: buildErrorEnvelope(
          handler.definition.name,
          toolCallId,
          decision.reason,
          startedAt,
          'tool_denied',
          { policy }
        ),
      };
    }

    if (decision.kind === 'require_approval') {
      const policy: AgentPolicySummary = {
        action: 'require_approval',
        matches: decision.matches,
      };
      return this.createApprovalPause({
        handler,
        toolCallId,
        args,
        ctx,
        reason: decision.reason,
        policy,
        onApproved: (signal) =>
          handler.definition.name === 'session.run_command'
            ? this.executeSessionCommandWithPause(
                handler,
                toolCallId,
                args,
                { ...ctx, signal },
                Date.now()
              )
            : this.executeAllowedHandler(
                handler,
                toolCallId,
                args,
                { ...ctx, signal },
                Date.now()
              ),
      });
    }

    return this.wrapExecutionResult(
      await this.executeAllowedHandler(handler, toolCallId, args, ctx, startedAt)
    );
  }

  private wrapExecutionResult(
    result: ToolExecutionEnvelope | ToolPauseOutcome
  ): ToolExecutionResult {
    if ('kind' in result) {
      return result;
    }

    return result.ok
      ? { kind: 'success', envelope: result }
      : { kind: 'failure', envelope: result };
  }

  private createApprovalPause(options: {
    handler: ToolHandler;
    toolCallId: string;
    args: unknown;
    ctx: ToolExecutionContext;
    reason: string;
    policy: AgentPolicySummary;
    onApproved: (signal: AbortSignal) => Promise<ToolExecutionEnvelope | ToolPauseOutcome>;
  }): ToolPauseOutcome {
    const continuationSignal = createContinuationSignalController(options.ctx.signal);
    continuationSignal.release();

    return {
      kind: 'pause',
      interaction: {
        source: 'policy_approval',
        context: {
          toolCallId: options.toolCallId,
          toolName: options.handler.definition.name,
          arguments: (options.args ?? {}) as Record<string, unknown>,
          policy: options.policy,
        },
      },
      continuation: {
        resume: async (signal) => {
          continuationSignal.bind(asAbortSignal(signal));
          try {
            return await options.onApproved(continuationSignal.signal);
          } finally {
            continuationSignal.release();
          }
        },
        reject: () =>
          buildErrorEnvelope(
            options.handler.definition.name,
            options.toolCallId,
            '用户拒绝了需要审批的操作。',
            Date.now(),
            'approval_rejected',
            { approvalRequired: true, policy: options.policy }
          ),
      },
    };
  }

  private createUserInteractionPause(
    toolCallId: string,
    args: unknown,
    startedAt: number
  ): ToolPauseOutcome {
    const normalized = normalizeInteractionRequestArgs(args);

    return {
      kind: 'pause',
      interaction: {
        source: 'user_interaction',
        context: {
          toolCallId,
          toolName: 'interaction.request',
          interactionKind: normalized.kind,
          riskLevel: normalized.riskLevel,
          blockingMode: normalized.blockingMode,
          title: normalized.title,
          message: normalized.message,
          fields: normalized.fields,
          actions: buildInteractionActions(normalized.kind),
          metadata: normalized.metadata,
        },
      },
      continuation: {
        resume: async (submission) => {
          const selectedAction =
            typeof submission === 'object' &&
            submission !== null &&
            'selectedAction' in submission &&
            typeof (submission as { selectedAction?: unknown }).selectedAction === 'string'
              ? (submission as { selectedAction: string }).selectedAction
              : normalized.kind === 'approval'
                ? 'approve'
                : normalized.kind === 'inform'
                  ? 'acknowledge'
                  : 'submit';
          const payload =
            typeof submission === 'object' &&
            submission !== null &&
            'payload' in submission &&
            typeof (submission as { payload?: unknown }).payload === 'object' &&
            (submission as { payload?: unknown }).payload !== null
              ? ((submission as { payload: Record<string, unknown> }).payload ?? {})
              : {};

          return buildInteractionRequestEnvelope(
            toolCallId,
            startedAt,
            normalized.kind,
            {
              selectedAction,
              ...(Object.keys(payload).length > 0 ? payload : {}),
            }
          );
        },
        reject: () =>
          buildErrorEnvelope(
            'interaction.request',
            toolCallId,
            '用户取消了该交互请求。',
            startedAt,
            'interaction_rejected',
            { retryable: false }
          ),
      },
    };
  }

  private async executePlannedSessionCommand(
    handler: ToolHandler,
    toolCallId: string,
    args: unknown,
    ctx: ToolExecutionContext,
    startedAt: number,
    state: SessionCommandExecutionState = {}
  ): Promise<ToolExecutionEnvelope | ToolPauseOutcome> {
    if (!isSessionCommandArgs(args)) {
      return this.executeSessionCommandWithPause(handler, toolCallId, args, ctx, startedAt);
    }

    const confirmedFields = state.confirmedFields ?? {};
    const basePlan = buildSessionCommandPlan({
      command: args.command,
      effectiveRules: ctx.effectiveRules,
      sessionGroupName: ctx.sessionGroupName,
      userTask: ctx.userTask,
    });
    const confirmedCommand = applyConfirmedParameters(
      args.command,
      basePlan.parameters.map(toParameterConfirmationField),
      confirmedFields
    );
    const sessionPlan = buildSessionCommandPlan({
      command: confirmedCommand,
      effectiveRules: ctx.effectiveRules,
      sessionGroupName: ctx.sessionGroupName,
      userTask: ctx.userTask,
      confirmedFields,
    });

    if (sessionPlan.decision.kind === 'require_parameter_confirmation') {
      const fields = sessionPlan.parameters.map(toParameterConfirmationField);
      const continuationSignal = createContinuationSignalController(ctx.signal);
      continuationSignal.release();

      return {
        kind: 'pause',
        interaction: {
          source: 'parameter_collection',
          context: {
            toolCallId,
            toolName: 'session.run_command',
            command: confirmedCommand,
            intentKind: sessionPlan.intent.kind,
            fields,
          },
        },
        continuation: {
          resume: async (fieldsInput, signal) => {
            continuationSignal.bind(asAbortSignal(signal));
            try {
              return await this.executePlannedSessionCommand(
                handler,
                toolCallId,
                { ...args, command: confirmedCommand },
                { ...ctx, signal: continuationSignal.signal },
                Date.now(),
                {
                  ...state,
                  confirmedFields:
                    (fieldsInput ?? {}) as Partial<Record<ProtectedParameterName, string>>,
                }
              );
            } finally {
              continuationSignal.release();
            }
          },
          reject: () =>
            buildErrorEnvelope(
              handler.definition.name,
              toolCallId,
              '用户未确认关键参数，操作已取消。',
              Date.now(),
              'parameter_confirmation_rejected'
            ),
        },
      };
    }

    if (sessionPlan.decision.kind === 'require_approval' && !state.plannerApprovalGranted) {
      if (
        shouldDeferPlannerApprovalToTerminalInput({
          approvalMode: ctx.approvalMode,
          command: confirmedCommand,
          extractedParameterCount: sessionPlan.parameters.length,
        })
      ) {
        return this.executeSessionCommandWithPause(
          handler,
          toolCallId,
          { ...args, command: confirmedCommand },
          ctx,
          startedAt
        );
      }

      if (ctx.approvalMode !== 'manual-sensitive') {
        return buildErrorEnvelope(
          handler.definition.name,
          toolCallId,
          '当前 Agent 运行模式禁止需要审批的操作。',
          startedAt,
          'tool_denied',
          {
            policy: {
              action: 'require_approval',
              matches: [],
            },
          }
        );
      }

      return this.createApprovalPause({
        handler,
        toolCallId,
        args: { ...args, command: confirmedCommand },
        ctx,
        reason: '该操作需要用户审批后执行。',
        policy: {
          action: 'require_approval',
          matches: [],
        },
        onApproved: (signal) =>
          this.executePlannedSessionCommand(
            handler,
            toolCallId,
            { ...args, command: confirmedCommand },
            { ...ctx, signal },
            Date.now(),
            {
              ...state,
              confirmedFields,
              plannerApprovalGranted: true,
            }
          ),
      });
    }

    const fallbackDecision = evaluateSessionCommandPolicy({
      approvalMode: ctx.approvalMode,
      command: confirmedCommand,
    });

    if (fallbackDecision.kind === 'deny') {
      return buildErrorEnvelope(
        handler.definition.name,
        toolCallId,
        fallbackDecision.reason,
        startedAt,
        'tool_denied',
        {
          policy: {
            action: 'deny',
            matches: fallbackDecision.matches,
          },
        }
      );
    }

    if (fallbackDecision.kind === 'require_approval' && !state.policyApprovalGranted) {
      return this.createApprovalPause({
        handler,
        toolCallId,
        args: { ...args, command: confirmedCommand },
        ctx,
        reason: fallbackDecision.reason,
        policy: {
          action: 'require_approval',
          matches: fallbackDecision.matches,
        },
        onApproved: (signal) =>
          this.executePlannedSessionCommand(
            handler,
            toolCallId,
            { ...args, command: confirmedCommand },
            { ...ctx, signal },
            Date.now(),
            {
              ...state,
              confirmedFields,
              plannerApprovalGranted: true,
              policyApprovalGranted: true,
            }
          ),
      });
    }

    return this.executeSessionCommandWithPause(
      handler,
      toolCallId,
      { ...args, command: confirmedCommand },
      ctx,
      startedAt
    );
  }

  private async executeSessionCommandWithPause(
    handler: ToolHandler,
    toolCallId: string,
    args: unknown,
    ctx: ToolExecutionContext,
    startedAt: number
  ): Promise<ToolExecutionEnvelope | ToolPauseOutcome> {
    const commandArgs =
      typeof args === 'object' && args !== null
        ? (args as { sessionId?: unknown; command?: unknown })
        : null;
    const continuationSignal = createContinuationSignalController(ctx.signal);
    const managedContext = {
      ...ctx,
      signal: continuationSignal.signal,
    };
    let settledEnvelope: ToolExecutionEnvelope | null = null;
    const executionPromise = this.executeAllowedHandler(
      handler,
      toolCallId,
      args,
      managedContext,
      startedAt
    ).then((envelope) => {
      settledEnvelope = envelope;
      return envelope;
    }).finally(() => {
      continuationSignal.release();
    });
    const completionPromise = executionPromise.then((envelope) => ({
      kind: 'completed' as const,
      envelope,
    }));

    if (
      !commandArgs ||
      typeof commandArgs.sessionId !== 'string' ||
      typeof commandArgs.command !== 'string'
    ) {
      return executionPromise;
    }

    const sessionId = commandArgs.sessionId;
    const command = commandArgs.command;

    if (!ctx.capabilities.sessions.getPendingExecutionDebug) {
      return executionPromise;
    }

    while (true) {
      const result = await Promise.race([
        completionPromise,
        new Promise<{ kind: 'pending' }>((resolve) => {
          setTimeout(() => resolve({ kind: 'pending' }), TERMINAL_INPUT_POLL_INTERVAL_MS);
        }),
      ]);

      if (result.kind === 'completed') {
        return result.envelope;
      }

      const pendingExecution = ctx.capabilities.sessions.getPendingExecutionDebug(
        sessionId
      );
      if (
        !pendingExecution ||
        pendingExecution.command !== command ||
        (pendingExecution.state !== 'awaiting_human_input' &&
          pendingExecution.state !== 'suspended_waiting_for_input')
      ) {
        continue;
      }

      continuationSignal.release();

      return {
        kind: 'pause',
        interaction: {
          source: 'terminal_wait',
          context: {
            toolCallId,
            toolName: 'session.run_command',
            command,
            sessionLabel: ctx.sessionLabel,
            timeoutMs: DEFAULT_TERMINAL_INPUT_TIMEOUT_MS,
          },
        },
        continuation: {
          waitForCompletion: async (signal) => {
            continuationSignal.bind(signal);
            return executionPromise;
          },
          getSettledEnvelope: () => settledEnvelope,
        },
      };
    }
  }

  private async executeAllowedHandler(
    handler: ToolHandler,
    toolCallId: string,
    args: unknown,
    ctx: ToolExecutionContext,
    startedAt: number
  ): Promise<ToolExecutionEnvelope> {
    try {
      emitToolExecutionStarted(ctx, toolCallId, handler.definition.name);
      const result = await handler.execute(args, ctx);

      if (handler.definition.formatResult) {
        return handler.definition.formatResult(result, ctx);
      }

      const completedAt = Date.now();
      logAgent('tool_execution_succeeded', {
        runId: ctx.runId,
        step: ctx.step,
        toolCallId,
        toolName: handler.definition.name,
        durationMs: completedAt - startedAt,
      });
      return {
        toolName: handler.definition.name,
        toolCallId,
        ok: true,
        data: result,
        meta: {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
        },
      };
    } catch (error) {
      logAgent('tool_execution_failed', {
        runId: ctx.runId,
        step: ctx.step,
        toolCallId,
        toolName: handler.definition.name,
        error: error instanceof Error ? error.message : '工具执行失败。',
      });
      return buildErrorEnvelope(
        handler.definition.name,
        toolCallId,
        error instanceof Error ? error.message : '工具执行失败。',
        startedAt
      );
    }
  }
}

export type ToolCallExecutor = Pick<ToolExecutor, 'executeToolCall'>;

type NormalizedInteractionKind = Extract<InteractionKind, 'collect_input' | 'approval' | 'inform'>;

type NormalizedInteractionRequest = {
  kind: NormalizedInteractionKind;
  title: string;
  message: string;
  riskLevel: InteractionRiskLevel;
  blockingMode: InteractionBlockingMode;
  fields: InteractionField[];
  metadata: Record<string, unknown>;
};

function normalizeInteractionRequestArgs(args: unknown): NormalizedInteractionRequest {
  const value = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : null;
  if (!value) {
    throw new Error('interaction.request 参数格式不正确。');
  }

  const kind = value.kind;
  if (kind !== 'collect_input' && kind !== 'approval' && kind !== 'inform') {
    throw new Error('interaction.request.kind 不合法。');
  }

  const title = typeof value.title === 'string' && value.title.trim() ? value.title.trim() : null;
  const message =
    typeof value.message === 'string' && value.message.trim() ? value.message.trim() : null;
  if (!title || !message) {
    throw new Error('interaction.request 必须提供 title 和 message。');
  }

  const fields = normalizeInteractionFields(value.fields);
  if (kind === 'collect_input' && fields.length === 0) {
    throw new Error('collect_input 交互至少需要一个字段。');
  }

  return {
    kind,
    title,
    message,
    riskLevel: normalizeInteractionRiskLevel(value.riskLevel, kind),
    blockingMode: normalizeInteractionBlockingMode(value.blockingMode, kind),
    fields,
    metadata: {
      sourceIntent: 'model_requested_interaction',
      ...(typeof value.reason === 'string' && value.reason.trim()
        ? { reason: value.reason.trim() }
        : {}),
    },
  };
}

function normalizeInteractionFields(value: unknown): InteractionField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((field, index) => normalizeInteractionField(field, index));
}

function normalizeInteractionField(value: unknown, index: number): InteractionField {
  const field = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  if (!field || typeof field.type !== 'string' || typeof field.key !== 'string') {
    throw new Error(`interaction.request.fields[${index}] 格式不正确。`);
  }

  const required = field.required === true;
  const label =
    typeof field.label === 'string' && field.label.trim()
      ? field.label.trim()
      : field.type === 'display'
        ? undefined
        : field.key;

  if (field.type === 'display') {
    if (typeof field.value !== 'string') {
      throw new Error(`interaction.request.fields[${index}] display 字段必须提供 value。`);
    }

    return {
      type: 'display',
      key: field.key,
      label,
      value: field.value,
    };
  }

  if (field.type === 'text' || field.type === 'password' || field.type === 'textarea') {
    return {
      type: field.type,
      key: field.key,
      label: label ?? field.key,
      required,
      value: typeof field.value === 'string' ? field.value : undefined,
      placeholder: typeof field.placeholder === 'string' ? field.placeholder : undefined,
    };
  }

  if (field.type === 'single_select' || field.type === 'multi_select') {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      throw new Error(`interaction.request.fields[${index}] 选择字段必须提供 options。`);
    }

    const options = field.options.map((option, optionIndex) => {
      const item =
        typeof option === 'object' && option !== null ? (option as Record<string, unknown>) : null;
      if (!item || typeof item.label !== 'string' || typeof item.value !== 'string') {
        throw new Error(
          `interaction.request.fields[${index}].options[${optionIndex}] 格式不正确。`
        );
      }

      return {
        label: item.label,
        value: item.value,
        description: typeof item.description === 'string' ? item.description : undefined,
      };
    });

    if (field.type === 'single_select') {
      return {
        type: 'single_select',
        key: field.key,
        label: label ?? field.key,
        required,
        options,
        value: typeof field.value === 'string' ? field.value : undefined,
      };
    }

    return {
      type: 'multi_select',
      key: field.key,
      label: label ?? field.key,
      required,
      options,
      value: Array.isArray(field.values)
        ? field.values.filter((item): item is string => typeof item === 'string')
        : undefined,
    };
  }

  if (field.type === 'confirm') {
    return {
      type: 'confirm',
      key: field.key,
      label: label ?? field.key,
      required,
      value: field.checked === true,
    };
  }

  throw new Error(`interaction.request.fields[${index}] 类型不支持：${field.type}`);
}

function normalizeInteractionRiskLevel(
  value: unknown,
  kind: NormalizedInteractionKind
): InteractionRiskLevel {
  if (
    value === 'none' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'critical'
  ) {
    return value;
  }

  if (kind === 'approval') {
    return 'high';
  }

  if (kind === 'inform') {
    return 'low';
  }

  return 'medium';
}

function normalizeInteractionBlockingMode(
  value: unknown,
  kind: NormalizedInteractionKind
): InteractionBlockingMode {
  if (value === 'none' || value === 'soft_block' || value === 'hard_block') {
    return value;
  }

  return kind === 'approval' ? 'hard_block' : 'soft_block';
}

function buildInteractionActions(kind: NormalizedInteractionKind): InteractionAction[] {
  if (kind === 'approval') {
    return [
      { id: 'approve', label: '继续执行', kind: 'approve', style: 'danger' },
      { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
    ];
  }

  if (kind === 'inform') {
    return [{ id: 'acknowledge', label: '知道了', kind: 'acknowledge', style: 'primary' }];
  }

  return [
    { id: 'submit', label: '提交并继续', kind: 'submit', style: 'primary' },
    { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
  ];
}

function buildInteractionRequestEnvelope(
  toolCallId: string,
  startedAt: number,
  kind: NormalizedInteractionKind,
  data: Record<string, unknown>
): ToolExecutionEnvelope {
  const completedAt = Date.now();

  return {
    toolName: 'interaction.request',
    toolCallId,
    ok: true,
    data: {
      kind,
      ...data,
    },
    meta: {
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
    },
  };
}
