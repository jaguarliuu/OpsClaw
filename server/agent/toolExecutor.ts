import type { ToolCall } from '@mariozechner/pi-ai';

import type { AgentPolicySummary, ToolExecutionEnvelope } from './agentTypes.js';
import { logAgent } from './logger.js';
import { evaluateToolPolicy } from './toolPolicy.js';
import type { ToolExecutionContext, ToolHandler, ToolRegistry } from './toolTypes.js';

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
  ): Promise<ToolExecutionEnvelope> {
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
      return buildErrorEnvelope(
        toolCall.name,
        toolCall.id,
        `未找到工具：${toolCall.name}`,
        startedAt,
        'tool_not_found'
      );
    }

    return this.executeHandler(handler, toolCall.id, args, ctx, startedAt);
  }

  private async executeHandler(
    handler: ToolHandler,
    toolCallId: string,
    args: unknown,
    ctx: ToolExecutionContext,
    startedAt: number
  ): Promise<ToolExecutionEnvelope> {
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
      return buildErrorEnvelope(
        handler.definition.name,
        toolCallId,
        decision.reason,
        startedAt,
        'tool_denied',
        { policy }
      );
    }

    if (decision.kind === 'require_approval') {
      const policy: AgentPolicySummary = {
        action: 'require_approval',
        matches: decision.matches,
      };
      ctx.emit({
        type: 'approval_required',
        runId: ctx.runId,
        step: ctx.step,
        toolCallId,
        toolName: handler.definition.name,
        reason: decision.reason,
        policy,
        timestamp: startedAt,
      });

      return buildErrorEnvelope(
        handler.definition.name,
        toolCallId,
        `${decision.reason} 当前版本尚未提供交互审批流程。`,
        startedAt,
        'approval_required',
        { approvalRequired: true, policy }
      );
    }

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
