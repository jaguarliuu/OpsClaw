import type { ToolPolicyDecision, ToolHandler, ToolExecutionContext } from './toolTypes.js';

const SENSITIVE_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\buserdel\b/i,
  /\bchmod\s+777\b/i,
  /\biptables\b/i,
  /\bkubectl\s+delete\b/i,
  /\bterraform\s+apply\b/i,
  /\b(systemctl|service)\s+(start|restart|stop)\b/i,
];

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
      return { kind: 'require_approval', reason: '该工具被标记为高风险操作。' };
    }

    return { kind: 'deny', reason: '当前 Agent 运行模式不允许执行高风险工具。' };
  }

  if (tool.definition.requiresApproval?.(args as never, ctx)) {
    if (ctx.approvalMode === 'manual-sensitive') {
      return { kind: 'require_approval', reason: '该操作需要用户审批后执行。' };
    }

    return { kind: 'deny', reason: '当前 Agent 运行模式禁止需要审批的操作。' };
  }

  if (tool.definition.name === 'session.run_command') {
    const command = readCommandArgument(args);
    if (command && SENSITIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
      if (ctx.approvalMode === 'manual-sensitive') {
        return {
          kind: 'require_approval',
          reason: '命令命中敏感操作策略，需要用户审批后执行。',
        };
      }

      return {
        kind: 'deny',
        reason: '命令命中敏感操作策略，当前模式仅允许只读或低风险命令。',
      };
    }
  }

  return { kind: 'allow' };
}
