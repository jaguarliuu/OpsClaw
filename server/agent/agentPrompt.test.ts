import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentSystemPrompt } from './agentPrompt.js';

void test('agent system prompt enforces controlled execution constraints before running mutations', () => {
  const prompt = buildAgentSystemPrompt({
    sessionId: 'session-1',
    initialStepBudget: 8,
    hardMaxSteps: 16,
  });

  assert.match(prompt, /在执行任何变更前，先判断这是诊断、低风险变更还是危险变更。/);
  assert.match(prompt, /用户名、密码、sudo 权限策略、写入目标、删除范围等关键参数不能自行编造。/);
  assert.match(prompt, /若关键参数未由用户明确提供，必须先请求参数确认，不能直接执行 session\.run_command。/);
  assert.match(prompt, /即使生成了命令，也必须遵守参数确认和审批 gate，不能绕过。/);
});
