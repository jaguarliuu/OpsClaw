import type { AgentPolicySummary } from './types.agent';

export function formatAgentPolicySummary(policy: AgentPolicySummary | undefined) {
  if (!policy || policy.matches.length === 0) {
    return null;
  }

  return `已命中策略：${policy.matches
    .map((match) => `${match.ruleId}（${match.title}）`)
    .join('、')}`;
}
