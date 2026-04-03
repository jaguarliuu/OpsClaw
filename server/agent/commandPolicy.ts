import type { AgentApprovalMode } from './agentTypes.js';
import type { ToolPolicyDecision, ToolPolicyMatch } from './toolTypes.js';

type CommandPolicyAction = 'require_approval';

type CommandPolicyRule = {
  ruleId: string;
  title: string;
  severity: ToolPolicyMatch['severity'];
  action: CommandPolicyAction;
  reason: string;
  pattern: RegExp;
};

type EvaluateSessionCommandPolicyInput = {
  approvalMode: AgentApprovalMode;
  command: string;
};

const COMMAND_RULES: CommandPolicyRule[] = [
  {
    ruleId: 'shell.delete.recursive',
    title: '递归删除',
    severity: 'critical',
    action: 'require_approval',
    reason: '命令包含递归删除，可能造成不可逆数据丢失。',
    pattern: /\brm\s+-rf\b/i,
  },
  {
    ruleId: 'filesystem.format',
    title: '磁盘格式化',
    severity: 'critical',
    action: 'require_approval',
    reason: '命令包含磁盘格式化，风险极高。',
    pattern: /\bmkfs\b/i,
  },
  {
    ruleId: 'service.restart',
    title: '服务重启',
    severity: 'high',
    action: 'require_approval',
    reason: '命令会重启或停止服务，可能影响在线流量。',
    pattern: /\b(systemctl|service)\s+(start|restart|stop)\b/i,
  },
];

function evaluateRuleMatches(command: string): ToolPolicyMatch[] {
  return COMMAND_RULES.flatMap((rule) => {
    const matchedText = command.match(rule.pattern)?.[0];
    if (!matchedText) {
      return [];
    }

    return [
      {
        ruleId: rule.ruleId,
        title: rule.title,
        severity: rule.severity,
        reason: rule.reason,
        matchedText,
      },
    ];
  });
}

export function evaluateSessionCommandPolicy({
  approvalMode,
  command,
}: EvaluateSessionCommandPolicyInput): ToolPolicyDecision {
  const matches = evaluateRuleMatches(command);
  if (matches.length === 0) {
    return { kind: 'allow', matches: [] };
  }

  if (approvalMode === 'manual-sensitive') {
    return {
      kind: 'require_approval',
      reason: '命令命中敏感操作策略，需要用户审批后执行。',
      matches,
    };
  }

  return {
    kind: 'deny',
    reason: '命令命中敏感操作策略，当前模式仅允许只读或低风险命令。',
    matches,
  };
}
