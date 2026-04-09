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
  assert.match(prompt, /当你需要用户补充参数、做选择、确认方案时，必须调用 interaction\.request 工具。/);
  assert.match(prompt, /不要直接用 assistant 文本向用户提问。/);
  assert.match(prompt, /在当前节点会话下读写节点记忆时，不要自行编造 nodeId；优先省略 nodeId，让系统自动绑定当前节点。/);
});

void test('agent system prompt includes cached session system info when available', () => {
  const prompt = buildAgentSystemPrompt({
    sessionId: 'session-1',
    initialStepBudget: 12,
    hardMaxSteps: 24,
    sessionSystemInfo: {
      distributionId: 'ubuntu',
      versionId: '22.04',
      packageManager: 'apt',
      kernel: '6.8.0-40-generic',
      architecture: 'x86_64',
      defaultShell: '/bin/bash',
    },
  });

  assert.match(prompt, /当前会话已缓存的系统信息：/);
  assert.match(prompt, /发行版：ubuntu 22\.04/);
  assert.match(prompt, /包管理器：apt/);
  assert.match(prompt, /内核：6\.8\.0-40-generic/);
  assert.match(prompt, /架构：x86_64/);
  assert.match(prompt, /默认 shell：\/bin\/bash/);
  assert.match(prompt, /不要为了确认基础系统类型再次执行 os-release、uname、包管理器探测命令/);
});
