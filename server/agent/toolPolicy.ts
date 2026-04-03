import type { ToolPolicyDecision, ToolHandler, ToolExecutionContext } from './toolTypes.js';
import { evaluateSessionCommandPolicy } from './commandPolicy.js';

function readCommandArgument(args: unknown) {
  if (!args || typeof args !== 'object') {
    return null;
  }

  const command = (args as { command?: unknown }).command;
  return typeof command === 'string' ? command : null;
}

export function evaluateToolPolicy(
  tool: ToolHandler,
  args: unknown,
  ctx: ToolExecutionContext
): ToolPolicyDecision {
  if (tool.definition.riskLevel === 'dangerous') {
    if (ctx.approvalMode === 'manual-sensitive') {
      return { kind: 'require_approval', reason: '该工具被标记为高风险操作。', matches: [] };
    }

    return { kind: 'deny', reason: '当前 Agent 运行模式不允许执行高风险工具。', matches: [] };
  }

  if (tool.definition.requiresApproval?.(args as never, ctx)) {
    if (ctx.approvalMode === 'manual-sensitive') {
      return { kind: 'require_approval', reason: '该操作需要用户审批后执行。', matches: [] };
    }

    return { kind: 'deny', reason: '当前 Agent 运行模式禁止需要审批的操作。', matches: [] };
  }

  if (tool.definition.name === 'session.run_command') {
    const command = readCommandArgument(args);
    if (command) {
      return evaluateSessionCommandPolicy({
        approvalMode: ctx.approvalMode,
        command,
      });
    }
  }

  return { kind: 'allow', matches: [] };
}
