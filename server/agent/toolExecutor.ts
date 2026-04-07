import type { ToolCall } from '@mariozechner/pi-ai';

import type { AgentPolicySummary, ToolExecutionEnvelope } from './agentTypes.js';
import type {
  ApprovalGatePayload,
  ParameterConfirmationField,
  ParameterConfirmationGatePayload,
  TerminalInputGatePayload,
} from './humanGateTypes.js';
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
const PARAMETER_CONFIRMATION_REASON = '该变更缺少已确认的关键参数，需先由用户确认。';

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

function shouldDeferPlannerApprovalToTerminalInput(command: string, extractedParameterCount: number) {
  return extractedParameterCount === 0 && /\bpasswd\b/i.test(command);
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
    const handler = this.registry.get(toolCall.name);
    const startedAt = Date.now();
    logAgent('tool_execution_requested', {
      runId: ctx.runId,
      step: ctx.step,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
    });

    if (!handler) {
      logAgent('tool_execution_missing_handler', {
        runId: ctx.runId,
        step: ctx.step,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      });
      return {
        kind: 'failure',
        envelope: buildErrorEnvelope(
          toolCall.name,
          toolCall.id,
          `未找到工具：${toolCall.name}`,
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
    const payload: ApprovalGatePayload = {
      toolCallId: options.toolCallId,
      toolName: options.handler.definition.name,
      arguments: (options.args ?? {}) as Record<string, unknown>,
      policy: options.policy,
    };
    continuationSignal.release();

    return {
      kind: 'pause',
      gateKind: 'approval',
      reason: options.reason,
      payload,
      continuation: {
        resume: async (signal) => {
          continuationSignal.bind(signal);
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
      const payload: ParameterConfirmationGatePayload = {
        toolCallId,
        toolName: 'session.run_command',
        command: confirmedCommand,
        intentKind: sessionPlan.intent.kind,
        fields,
      };
      const continuationSignal = createContinuationSignalController(ctx.signal);
      continuationSignal.release();

      return {
        kind: 'pause',
        gateKind: 'parameter_confirmation',
        reason: PARAMETER_CONFIRMATION_REASON,
        payload,
      continuation: {
        resume: async (fieldsInput, signal) => {
          continuationSignal.bind(signal);
          try {
            return await this.executePlannedSessionCommand(
                handler,
                toolCallId,
                { ...args, command: confirmedCommand },
                { ...ctx, signal: continuationSignal.signal },
                Date.now(),
                {
                  ...state,
                  confirmedFields: fieldsInput,
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
        shouldDeferPlannerApprovalToTerminalInput(confirmedCommand, sessionPlan.parameters.length)
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

      const payload: TerminalInputGatePayload = {
        toolCallId,
        toolName: 'session.run_command',
        command,
        sessionLabel: ctx.sessionLabel,
        timeoutMs: DEFAULT_TERMINAL_INPUT_TIMEOUT_MS,
      };
      continuationSignal.release();

      return {
        kind: 'pause',
        gateKind: 'terminal_input',
        reason: '命令正在等待你在终端中继续输入。',
        payload,
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
