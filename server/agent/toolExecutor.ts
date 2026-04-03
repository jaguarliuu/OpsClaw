import type { ToolCall } from '@mariozechner/pi-ai';

import type { AgentPolicySummary, ToolExecutionEnvelope } from './agentTypes.js';
import type { ApprovalGatePayload, TerminalInputGatePayload } from './humanGateTypes.js';
import { logAgent } from './logger.js';
import { evaluateToolPolicy } from './toolPolicy.js';
import type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolHandler,
  ToolPauseOutcome,
  ToolRegistry,
} from './toolTypes.js';

const TERMINAL_INPUT_POLL_INTERVAL_MS = 25;
const DEFAULT_TERMINAL_INPUT_TIMEOUT_MS = 300_000;

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
      const payload: ApprovalGatePayload = {
        toolCallId,
        toolName: handler.definition.name,
        arguments: (args ?? {}) as Record<string, unknown>,
        policy,
      };

      return {
        kind: 'pause',
        gateKind: 'approval',
        reason: decision.reason,
        payload,
        continuation: {
          resume: async () => {
            const approvedStartedAt = Date.now();
            return this.executeAllowedHandler(handler, toolCallId, args, ctx, approvedStartedAt);
          },
          reject: () =>
            buildErrorEnvelope(
              handler.definition.name,
              toolCallId,
              '用户拒绝了需要审批的操作。',
              Date.now(),
              'approval_rejected',
              { approvalRequired: true, policy }
            ),
        },
      };
    }

    const handlerResult =
      handler.definition.name === 'session.run_command'
        ? await this.executeSessionCommandWithPause(handler, toolCallId, args, ctx, startedAt)
        : await this.executeAllowedHandler(handler, toolCallId, args, ctx, startedAt);

    if ('kind' in handlerResult) {
      return handlerResult;
    }

    return handlerResult.ok
      ? { kind: 'success', envelope: handlerResult }
      : { kind: 'failure', envelope: handlerResult };
  }

  private async executeSessionCommandWithPause(
    handler: ToolHandler,
    toolCallId: string,
    args: unknown,
    ctx: ToolExecutionContext,
    startedAt: number
  ): Promise<ToolExecutionEnvelope | ToolPauseOutcome> {
    ctx.emit({
      type: 'tool_execution_started',
      runId: ctx.runId,
      step: ctx.step,
      toolCallId,
      toolName: handler.definition.name,
      timestamp: startedAt,
    });
    logAgent('tool_execution_started', {
      runId: ctx.runId,
      step: ctx.step,
      toolCallId,
      toolName: handler.definition.name,
    });

    const commandArgs =
      typeof args === 'object' && args !== null
        ? (args as { sessionId?: unknown; command?: unknown })
        : null;

    const executionPromise = this.executeAllowedHandler(handler, toolCallId, args, ctx, startedAt);
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

      return {
        kind: 'pause',
        gateKind: 'terminal_input',
        reason: '命令正在等待你在终端中继续输入。',
        payload,
        continuation: {
          waitForCompletion: executionPromise,
          resume: async () => {
            ctx.capabilities.sessions.resumePendingExecutionWait(sessionId, payload.timeoutMs);
            return executionPromise;
          },
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
