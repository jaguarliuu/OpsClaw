import assert from 'node:assert/strict';
import test from 'node:test';

import type { AssistantMessage, AssistantMessageEventStream, Context } from '@mariozechner/pi-ai';

import type { StoredLlmProvider } from '../llmProviderStore.js';
import { createToolRegistry } from './toolRegistry.js';
import { ToolExecutor } from './toolExecutor.js';
import { OpsAgentRuntime } from './agentRuntime.js';
import { sessionToolProvider } from './tools/sessionProvider.js';

function createProvider(): StoredLlmProvider {
  return {
    id: 'provider-1',
    name: 'Test Provider',
    providerType: 'qwen',
    baseUrl: null,
    apiKey: 'test-key',
    hasApiKey: true,
    models: ['qwen-plus'],
    defaultModel: 'qwen-plus',
    enabled: true,
    isDefault: true,
    maxTokens: 4096,
    temperature: 0,
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
  };
}

function createAssistantMessage(message: Partial<AssistantMessage>): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    stopReason: 'stop',
    timestamp: Date.now(),
    ...message,
  } as AssistantMessage;
}

test('任务完成后会将稳定观察整理后自动沉淀到节点记忆', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const fileMemoryCalls: Array<{ nodeId: string; nodeName: string; content: string }> = [];
  const completionContexts: Context[] = [];

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '# 全局记忆\n\n- 优先直接读取稳定事实',
          exists: true,
          updatedAt: null,
        };
      },
      async readNodeMemory() {
        return {
          scope: 'node',
          id: 'node-1',
          title: '节点记忆 · 生产机',
          path: '/tmp/node-1/MEMORY.md',
          content: '# 节点记忆 · 生产机\n\n## 自动沉淀\n\n- 旧记录',
          exists: true,
          updatedAt: null,
        };
      },
      async appendAutoNodeMemoryEntry(nodeId: string, nodeName: string, content: string) {
        fileMemoryCalls.push({ nodeId, nodeName, content });
        return {
          scope: 'node',
          id: nodeId,
          title: `节点记忆 · ${nodeName}`,
          path: `/tmp/${nodeId}/MEMORY.md`,
          content,
          exists: true,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById(nodeId) {
      if (nodeId !== 'node-1') {
        return null;
      }

      return {
        id: 'node-1',
        name: '生产机',
        groupId: 'group-1',
        groupName: '默认',
        jumpHostId: null,
        host: '10.0.0.8',
        port: 22,
        username: 'ubuntu',
        authMode: 'password',
        note: '',
        password: null,
        privateKey: null,
        passphrase: null,
        hasPassword: false,
        hasPrivateKey: false,
        hasPassphrase: false,
        createdAt: '2026-03-26T00:00:00.000Z',
        updatedAt: '2026-03-26T00:00:00.000Z',
      };
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: 'node-1',
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand() {
        return {
          command: 'free -h',
          exitCode: 0,
          output: 'Mem: 31Gi used 12Gi free 19Gi',
          durationMs: 82,
        };
      },
    } as never,
    completeAgentContext: async (_provider, _model, context) => {
      completionContexts.push(context);

      if (completionContexts.length === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'text',
              text: '先检查内存情况。',
            },
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: 'free -h',
                reason: '检查主机内存占用',
              },
            },
          ],
        });
      }

      if (completionContexts.length === 2) {
        return createAssistantMessage({
          stopReason: 'stop',
          content: [
            {
              type: 'text',
              text: '当前主机内存占用正常，可用内存充足。',
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [
          {
            type: 'text',
            text: [
              '### 内存观察',
              '',
              '- `free -h` 显示总内存 31Gi，空闲约 19Gi。',
              '- 当前没有发现内存压力迹象，可先保持常规观察频率。',
            ].join('\n'),
          },
        ],
      });
    },
  });

  const events: string[] = [];

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '查看当前主机的内存占用',
      sessionId: 'session-1',
    },
    event => {
      events.push(event.type);
    },
    new AbortController().signal
  );

  assert.deepEqual(events, [
    'run_started',
    'run_state_changed',
    'assistant_message',
    'tool_call',
    'tool_execution_started',
    'tool_execution_finished',
    'assistant_message',
    'run_completed',
  ]);
  assert.equal(completionContexts.length, 3);
  assert.equal(fileMemoryCalls.length, 1);
  assert.equal(fileMemoryCalls[0]?.nodeId, 'node-1');
  assert.match(fileMemoryCalls[0]?.content ?? '', /### 内存观察/);
  assert.doesNotMatch(fileMemoryCalls[0]?.content ?? '', /#### 关键观察/);
});

test('streamAgentContext 可将 assistant 文本按 delta 流式发出，同时保留最终消息事件', async () => {
  const registry = createToolRegistry();
  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
      async readNodeMemory() {
        return {
          scope: 'node',
          id: 'node-1',
          title: '节点记忆',
          path: '/tmp/node-1/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
      async appendAutoNodeMemoryEntry() {
        throw new Error('should not persist memory for this test');
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
    },
    streamAgentContext() {
      return (async function* () {
        const partial = createAssistantMessage({
          api: 'openai-completions',
          provider: 'openai',
          model: 'qwen-plus',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          content: [{ type: 'text', text: '正在检查磁盘' }],
        });

        yield {
          type: 'start' as const,
          partial,
        };
        yield {
          type: 'text_start' as const,
          contentIndex: 0,
          partial,
        };
        yield {
          type: 'text_delta' as const,
          contentIndex: 0,
          delta: '正在',
          partial,
        };
        yield {
          type: 'text_delta' as const,
          contentIndex: 0,
          delta: '检查磁盘',
          partial,
        };
        yield {
          type: 'text_end' as const,
          contentIndex: 0,
          content: '正在检查磁盘',
          partial,
        };
        yield {
          type: 'done' as const,
          reason: 'stop' as const,
          message: partial,
        };
      })() as unknown as AssistantMessageEventStream;
    },
  });

  const events: string[] = [];
  const deltas: string[] = [];

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '查看磁盘',
      sessionId: 'session-1',
    },
    event => {
      events.push(event.type);
      if (event.type === 'assistant_message_delta') {
        deltas.push(event.delta);
      }
    },
    new AbortController().signal
  );

  assert.deepEqual(events, [
    'run_started',
    'run_state_changed',
    'assistant_message_delta',
    'assistant_message_delta',
    'assistant_message',
    'run_completed',
  ]);
  assert.deepEqual(deltas, ['正在', '检查磁盘']);
});

test('自动记忆摘要失败时会回退到原始沉淀格式', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const fileMemoryCalls: Array<{ nodeId: string; nodeName: string; content: string }> = [];
  let completionCount = 0;

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
      async readNodeMemory() {
        return {
          scope: 'node',
          id: 'node-1',
          title: '节点记忆 · 生产机',
          path: '/tmp/node-1/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
      async appendAutoNodeMemoryEntry(nodeId: string, nodeName: string, content: string) {
        fileMemoryCalls.push({ nodeId, nodeName, content });
        return {
          scope: 'node',
          id: nodeId,
          title: `节点记忆 · ${nodeName}`,
          path: `/tmp/${nodeId}/MEMORY.md`,
          content,
          exists: true,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return {
        id: 'node-1',
        name: '生产机',
        groupId: 'group-1',
        groupName: '默认',
        jumpHostId: null,
        host: '10.0.0.8',
        port: 22,
        username: 'ubuntu',
        authMode: 'password',
        note: '',
        password: null,
        privateKey: null,
        passphrase: null,
        hasPassword: false,
        hasPrivateKey: false,
        hasPassphrase: false,
        createdAt: '2026-03-26T00:00:00.000Z',
        updatedAt: '2026-03-26T00:00:00.000Z',
      };
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: 'node-1',
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand() {
        return {
          command: 'df -h',
          exitCode: 0,
          output: '/dev/vda1 40G 12G 28G 31% /',
          durationMs: 36,
        };
      },
    } as never,
    completeAgentContext: async () => {
      completionCount += 1;

      if (completionCount === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: 'df -h',
              },
            },
          ],
        });
      }

      if (completionCount === 2) {
        return createAssistantMessage({
          stopReason: 'stop',
          content: [
            {
              type: 'text',
              text: '磁盘空间充足。',
            },
          ],
        });
      }

      throw new Error('summary failed');
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '查看当前主机的磁盘占用',
      sessionId: 'session-1',
    },
    () => {},
    new AbortController().signal
  );

  assert.equal(fileMemoryCalls.length, 1);
  assert.match(fileMemoryCalls[0]?.content ?? '', /#### 关键观察/);
  assert.match(fileMemoryCalls[0]?.content ?? '', /df -h/);
  assert.match(fileMemoryCalls[0]?.content ?? '', /磁盘空间充足/);
});

test('达到初始步数预算后如仍有进展会自动续期并继续完成任务', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  let completionCount = 0;
  const events: Array<{ type: string; message?: string; error?: string; steps?: number }> = [];

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand(_sessionId: string, command: string) {
        return {
          command,
          exitCode: 0,
          output: `result for ${command}`,
          durationMs: 10,
        };
      },
    } as never,
    completeAgentContext: async () => {
      completionCount += 1;

      if (completionCount <= 9) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: `call-${completionCount}`,
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: `echo step-${completionCount}`,
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [
          {
            type: 'text',
            text: '任务完成。',
          },
        ],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '执行一个需要超过 8 步的复杂诊断',
      sessionId: 'session-1',
    },
    event => {
      events.push({
        type: event.type,
        message: 'message' in event ? event.message : undefined,
        error: 'error' in event ? event.error : undefined,
        steps: 'steps' in event ? event.steps : undefined,
      });
    },
    new AbortController().signal
  );

  assert.equal(events.some(event => event.type === 'run_completed'), true);
  assert.equal(
    events.some(
      event => event.type === 'warning' && /自动续期 \+4 步/.test(event.message ?? '')
    ),
    true
  );
  assert.equal(events.some(event => event.type === 'run_failed'), false);
});

test('达到步数预算且最近几步没有有效进展时会停止而不是继续续期', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const events: Array<{ type: string; message?: string; error?: string }> = [];

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand() {
        return {
          command: 'pwd',
          exitCode: 0,
          output: '/srv/app',
          durationMs: 10,
        };
      },
    } as never,
    completeAgentContext: async () => {
      return createAssistantMessage({
        stopReason: 'toolUse',
        content: [
          {
            type: 'toolCall',
            id: `call-${Math.random()}`,
            name: 'session.run_command',
            arguments: {
              sessionId: 'session-1',
              command: 'pwd',
            },
          },
        ],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '反复确认当前目录',
      sessionId: 'session-1',
    },
    event => {
      events.push({
        type: event.type,
        message: 'message' in event ? event.message : undefined,
        error: 'error' in event ? event.error : undefined,
      });
    },
    new AbortController().signal
  );

  assert.equal(
    events.some(
      event => event.type === 'warning' && /没有有效进展/.test(event.message ?? '')
    ),
    true
  );
  assert.equal(
    events.some(
      event => event.type === 'run_failed' && /没有有效进展/.test(event.error ?? '')
    ),
    true
  );
});

test('显式传入更大的 maxSteps 时会允许复杂任务超过默认总预算继续完成', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const events: Array<{ type: string; error?: string; steps?: number }> = [];
  let completionCount = 0;

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand(_sessionId: string, command: string) {
        return {
          command,
          exitCode: 0,
          output: `ok ${command}`,
          durationMs: 10,
        };
      },
    } as never,
    completeAgentContext: async () => {
      completionCount += 1;

      if (completionCount <= 16) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: `call-${completionCount}`,
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: `echo advanced-step-${completionCount}`,
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [
          {
            type: 'text',
            text: '复杂任务完成。',
          },
        ],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '执行需要更高总步数预算的复杂任务',
      sessionId: 'session-1',
      maxSteps: 18,
    },
    event => {
      events.push({
        type: event.type,
        error: 'error' in event ? event.error : undefined,
        steps: 'steps' in event ? event.steps : undefined,
      });
    },
    new AbortController().signal
  );

  assert.equal(events.some(event => event.type === 'run_failed'), false);
  assert.equal(events.some(event => event.type === 'run_completed' && event.steps === 17), true);
});

test('当模型返回 error stopReason 时会把底层错误消息透传给 run_failed 事件', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand() {
        throw new Error('should not execute command on model error');
      },
    } as never,
    completeAgentContext: async () =>
      createAssistantMessage({
        stopReason: 'error',
        errorMessage: 'Provider finish_reason: content_filter',
        content: [],
      }),
  });

  const events: Array<{ type: string; error?: string }> = [];

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '检查当前机器状态',
      sessionId: 'session-1',
    },
    event => {
      events.push({
        type: event.type,
        error: 'error' in event ? event.error : undefined,
      });
    },
    new AbortController().signal
  );

  assert.deepEqual(events, [
    { type: 'run_started', error: undefined },
    { type: 'run_state_changed', error: undefined },
    { type: 'run_failed', error: 'Provider finish_reason: content_filter' },
  ]);
});

test('交互式 session 输入会打开 terminal_input gate 并在超时后挂起 run', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const events: unknown[] = [];
  let pendingStateChecks = 0;

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      getPendingExecutionDebug() {
        pendingStateChecks += 1;
        return {
          state: pendingStateChecks >= 2 ? 'suspended_waiting_for_input' : 'awaiting_human_input',
          command: 'sudo passwd root',
          startMarker: '__OPSCLAW_CMD_START_test__',
        };
      },
      async executeCommand() {
        return new Promise(() => undefined);
      },
    } as never,
    completeAgentContext: async () =>
      createAssistantMessage({
        stopReason: 'toolUse',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'session.run_command',
            arguments: {
              sessionId: 'session-1',
              command: 'sudo passwd root',
            },
          },
        ],
      }),
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '设置 root 密码',
      sessionId: 'session-1',
    },
    event => {
      events.push(event);
    },
    new AbortController().signal
  );

  const gateOpened = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_opened'
  ) as
    | {
        gate?: {
          kind?: unknown;
          payload?: {
            command?: unknown;
            sessionLabel?: unknown;
          };
        };
      }
    | undefined;

  const gateExpired = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_expired'
  ) as { gate?: { status?: unknown } } | undefined;

  const runStates = events
    .filter(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'run_state_changed'
    )
    .map(event => (event as { state?: unknown }).state);

  assert.equal(gateOpened?.gate?.kind, 'terminal_input');
  assert.equal(gateOpened?.gate?.payload?.command, 'sudo passwd root');
  assert.equal(gateOpened?.gate?.payload?.sessionLabel, 'ubuntu@10.0.0.8:22');
  assert.equal(gateExpired?.gate?.status, 'expired');
  assert.deepEqual(runStates, ['running', 'waiting_for_human', 'suspended']);
  assert.equal(
    events.some(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'run_failed'
    ),
    false
  );
});

test('交互式 session 等待期间如果命令上下文丢失会 reject terminal_input gate 并让 run_failed', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const events: unknown[] = [];

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      getPendingExecutionDebug() {
        return {
          state: 'awaiting_human_input',
          command: 'sudo passwd root',
          startMarker: '__OPSCLAW_CMD_START_test__',
        };
      },
      async executeCommand() {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('SSH 会话已关闭，交互式命令上下文丢失。'));
          }, 50);
        });
      },
    } as never,
    completeAgentContext: async () =>
      createAssistantMessage({
        stopReason: 'toolUse',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'session.run_command',
            arguments: {
              sessionId: 'session-1',
              command: 'sudo passwd root',
            },
          },
        ],
      }),
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '设置 root 密码',
      sessionId: 'session-1',
    },
    event => {
      events.push(event);
    },
    new AbortController().signal
  );

  const rejectedGateEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_rejected'
  ) as { gate?: { status?: unknown } } | undefined;
  const runFailedEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'run_failed'
  ) as { error?: unknown } | undefined;

  assert.equal(rejectedGateEvent?.gate?.status, 'rejected');
  assert.equal(runFailedEvent?.error, 'SSH 会话已关闭，交互式命令上下文丢失。');
  assert.equal(
    events.some(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'human_gate_resolved'
    ),
    false
  );
});

test('命中敏感命令策略时 approval gate 会打开并等待而不是产生 approval_required 失败', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const events: unknown[] = [];

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand() {
        throw new Error('should not execute approval-gated command');
      },
    } as never,
    completeAgentContext: async () =>
      createAssistantMessage({
        stopReason: 'toolUse',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'session.run_command',
            arguments: {
              sessionId: 'session-1',
              command: 'systemctl restart nginx',
            },
          },
        ],
      }),
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '重启 nginx 服务',
      sessionId: 'session-1',
      approvalMode: 'manual-sensitive',
    },
    event => {
      events.push(event);
    },
    new AbortController().signal
  );

  const approvalEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_opened'
  ) as
    | {
        gate?: {
          kind?: unknown;
          reason?: unknown;
          payload?: {
            policy?: {
              action?: unknown;
              matches?: Array<Record<string, unknown>>;
            };
          };
        };
      }
    | undefined;
  const approvalRequiredEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'approval_required'
  );
  const toolResultEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'tool_execution_finished'
  );
  const waitingStateEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'run_state_changed' &&
      (event as { state?: unknown }).state === 'waiting_for_human'
  );

  assert.ok(approvalEvent);
  assert.equal(approvalEvent.gate?.kind, 'approval');
  assert.equal(approvalEvent.gate?.reason, '命令命中敏感操作策略，需要用户审批后执行。');
  assert.equal(approvalEvent.gate?.payload?.policy?.action, 'require_approval');
  assert.equal(approvalEvent.gate?.payload?.policy?.matches?.[0]?.ruleId, 'service.restart');
  assert.equal(approvalEvent.gate?.payload?.policy?.matches?.[0]?.title, '服务重启');
  assert.equal(waitingStateEvent !== undefined, true);
  assert.equal(approvalRequiredEvent === undefined, true);
  assert.equal(toolResultEvent === undefined, true);
  assert.equal(
    events.some(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'run_failed'
    ),
    false
  );
});

test('resumeWaiting 会继续等待同一个 terminal_input gate 并让原始 run 自然完成', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const initialEvents: unknown[] = [];
  const resumedEvents: unknown[] = [];
  let completionCalls = 0;
  let pendingStateChecks = 0;
  let resumeCalls = 0;
  let pendingExecutionState: 'awaiting_human_input' | 'suspended_waiting_for_input' =
    'awaiting_human_input';
  let resolveCommand:
    | ((value: {
        command: string;
        exitCode: number;
        output: string;
        durationMs: number;
      }) => void)
    | null = null;

  const commandCompletion = new Promise<{
    command: string;
    exitCode: number;
    output: string;
    durationMs: number;
  }>((resolve) => {
    resolveCommand = resolve;
  });

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      getPendingExecutionDebug() {
        pendingStateChecks += 1;
        if (resumeCalls === 0 && pendingStateChecks >= 2) {
          pendingExecutionState = 'suspended_waiting_for_input';
        }

        return {
          state: pendingExecutionState,
          command: 'sudo passwd root',
          startMarker: '__OPSCLAW_CMD_START_test__',
        };
      },
      resumePendingExecutionWait() {
        resumeCalls += 1;
        pendingExecutionState = 'awaiting_human_input';
      },
      async executeCommand() {
        return commandCompletion;
      },
    } as never,
    completeAgentContext: async () => {
      completionCalls += 1;
      if (completionCalls === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: 'sudo passwd root',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '密码已经设置完成。' }],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '设置 root 密码',
      sessionId: 'session-1',
    },
    event => {
      initialEvents.push(event);
    },
    new AbortController().signal
  );

  const openedGateEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_opened'
  ) as { runId?: unknown; gate?: { id?: unknown } } | undefined;

  const runId = typeof openedGateEvent?.runId === 'string' ? openedGateEvent.runId : null;
  const gateId =
    openedGateEvent?.gate && typeof openedGateEvent.gate.id === 'string'
      ? openedGateEvent.gate.id
      : null;

  assert.ok(runId);
  assert.ok(gateId);

  const snapshot = runtime.resumeWaiting(runId, gateId);
  assert.equal(snapshot?.state, 'waiting_for_human');
  assert.equal(snapshot?.openGate?.status, 'open');
  assert.equal(resumeCalls, 1);

  const continuation = runtime.streamContinuation(
    runId,
    event => {
      resumedEvents.push(event);
    },
    new AbortController().signal
  );

  setTimeout(() => {
    pendingExecutionState = 'awaiting_human_input';
    resolveCommand?.({
      command: 'sudo passwd root',
      exitCode: 0,
      output: 'password updated successfully',
      durationMs: 42,
    });
  }, 10);

  await continuation;

  const resolvedGateEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_resolved'
  ) as { gate?: { status?: unknown } } | undefined;
  const toolFinishedEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'tool_execution_finished'
  ) as { result?: { ok?: unknown } } | undefined;

  assert.equal(resolvedGateEvent?.gate?.status, 'resolved');
  assert.equal(toolFinishedEvent?.result?.ok, true);
  assert.equal(
    resumedEvents.some(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'run_completed'
    ),
    true
  );
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'completed');
});

test('resolveGate 会让 approval gate 回到运行态并继续执行原始工具调用', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const initialEvents: unknown[] = [];
  const resumedEvents: unknown[] = [];
  let completionCalls = 0;
  let executeCalls = 0;

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand() {
        executeCalls += 1;
        return {
          command: 'systemctl restart nginx',
          exitCode: 0,
          output: 'ok',
          durationMs: 8,
        };
      },
    } as never,
    completeAgentContext: async () => {
      completionCalls += 1;
      if (completionCalls === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: 'systemctl restart nginx',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: 'nginx 已重启。' }],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '重启 nginx 服务',
      sessionId: 'session-1',
      approvalMode: 'manual-sensitive',
    },
    event => {
      initialEvents.push(event);
    },
    new AbortController().signal
  );

  const openedGateEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_opened'
  ) as { runId?: unknown; gate?: { id?: unknown } } | undefined;

  const runId = typeof openedGateEvent?.runId === 'string' ? openedGateEvent.runId : null;
  const gateId =
    openedGateEvent?.gate && typeof openedGateEvent.gate.id === 'string'
      ? openedGateEvent.gate.id
      : null;

  assert.ok(runId);
  assert.ok(gateId);

  const snapshot = await runtime.resolveGate(runId, gateId);
  assert.equal(snapshot?.openGate?.status, 'resolved');
  assert.equal(snapshot?.state, 'suspended');

  await runtime.streamContinuation(
    runId,
    event => {
      resumedEvents.push(event);
    },
    new AbortController().signal
  );

  const resolvedGateEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_resolved'
  ) as { gate?: { status?: unknown } } | undefined;
  const toolFinishedEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'tool_execution_finished'
  ) as { result?: { ok?: unknown } } | undefined;

  assert.equal(resolvedGateEvent?.gate?.status, 'resolved');
  assert.equal(toolFinishedEvent?.result?.ok, true);
  assert.equal(executeCalls, 1);
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'completed');
});

test('rejectGate 会把 approval gate 转成结构化拒绝结果并继续推进 run', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const initialEvents: unknown[] = [];
  const resumedEvents: unknown[] = [];
  let completionCalls = 0;
  let executeCalls = 0;

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand() {
        executeCalls += 1;
        throw new Error('approval rejected should not execute command');
      },
    } as never,
    completeAgentContext: async () => {
      completionCalls += 1;
      if (completionCalls === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: 'systemctl restart nginx',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '已停止执行高风险命令。' }],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '重启 nginx 服务',
      sessionId: 'session-1',
      approvalMode: 'manual-sensitive',
    },
    event => {
      initialEvents.push(event);
    },
    new AbortController().signal
  );

  const openedGateEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_opened'
  ) as { runId?: unknown; gate?: { id?: unknown } } | undefined;

  const runId = typeof openedGateEvent?.runId === 'string' ? openedGateEvent.runId : null;
  const gateId =
    openedGateEvent?.gate && typeof openedGateEvent.gate.id === 'string'
      ? openedGateEvent.gate.id
      : null;

  assert.ok(runId);
  assert.ok(gateId);

  const snapshot = await runtime.rejectGate(runId, gateId);
  assert.equal(snapshot?.openGate?.status, 'rejected');
  assert.equal(snapshot?.state, 'suspended');

  await runtime.streamContinuation(
    runId,
    event => {
      resumedEvents.push(event);
    },
    new AbortController().signal
  );

  const rejectedGateEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_rejected'
  ) as { gate?: { status?: unknown } } | undefined;
  const toolFinishedEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'tool_execution_finished'
  ) as { result?: { ok?: unknown; error?: { code?: unknown } } } | undefined;

  assert.equal(rejectedGateEvent?.gate?.status, 'rejected');
  assert.equal(toolFinishedEvent?.result?.ok, false);
  assert.equal(toolFinishedEvent?.result?.error?.code, 'approval_rejected');
  assert.equal(executeCalls, 0);
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'completed');
});

test('resolveGate 会在原始请求已 abort 后改用 continuation signal 执行 approval 工具', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const initialEvents: unknown[] = [];
  const resumedEvents: unknown[] = [];
  let completionCalls = 0;
  let executeCalls = 0;

  const initialController = new AbortController();

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      async executeCommand(
        _sessionId: string,
        command: string,
        options?: { signal?: AbortSignal }
      ) {
        executeCalls += 1;
        if (options?.signal?.aborted) {
          throw new Error('approval continuation received aborted signal');
        }

        return {
          sessionId: 'session-1',
          command,
          exitCode: 0,
          output: 'nginx restarted',
          truncated: false,
          startedAt: Date.now(),
          completedAt: Date.now(),
          durationMs: 5,
        };
      },
    } as never,
    completeAgentContext: async () => {
      completionCalls += 1;
      if (completionCalls === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: 'systemctl restart nginx',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: 'nginx 已重启。' }],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '重启 nginx 服务',
      sessionId: 'session-1',
      approvalMode: 'manual-sensitive',
    },
    event => {
      initialEvents.push(event);
      if (
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'human_gate_opened'
      ) {
        initialController.abort();
      }
    },
    initialController.signal
  );

  const openedGateEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_opened'
  ) as { runId?: unknown; gate?: { id?: unknown } } | undefined;

  const runId = typeof openedGateEvent?.runId === 'string' ? openedGateEvent.runId : null;
  const gateId =
    openedGateEvent?.gate && typeof openedGateEvent.gate.id === 'string'
      ? openedGateEvent.gate.id
      : null;

  assert.ok(runId);
  assert.ok(gateId);

  const snapshot = runtime.resolveGate(runId, gateId);
  assert.equal(snapshot?.openGate?.status, 'resolved');

  await runtime.streamContinuation(
    runId,
    event => {
      resumedEvents.push(event);
    },
    new AbortController().signal
  );

  const toolFinishedEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'tool_execution_finished'
  ) as { result?: { ok?: unknown; error?: { message?: unknown } } } | undefined;

  assert.equal(toolFinishedEvent?.result?.ok, true);
  assert.equal(toolFinishedEvent?.result?.error?.message, undefined);
  assert.equal(executeCalls, 1);
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'completed');
});

test('terminal_input gate 在原始请求已 abort 后仍可通过 continuation signal 恢复并完成', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const initialEvents: unknown[] = [];
  const resumedEvents: unknown[] = [];
  let completionCalls = 0;
  let pendingStateChecks = 0;
  let resumeCalls = 0;
  let pendingExecutionState: 'awaiting_human_input' | 'suspended_waiting_for_input' =
    'awaiting_human_input';
  let resolveCommand:
    | ((value: {
        sessionId: string;
        command: string;
        exitCode: number;
        output: string;
        truncated: boolean;
        startedAt: number;
        completedAt: number;
        durationMs: number;
      }) => void)
    | null = null;
  let rejectCommand: ((error: Error) => void) | null = null;

  const initialController = new AbortController();

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      getPendingExecutionDebug() {
        pendingStateChecks += 1;
        if (resumeCalls === 0 && pendingStateChecks >= 2) {
          pendingExecutionState = 'suspended_waiting_for_input';
        }

        return {
          state: pendingExecutionState,
          command: 'sudo passwd root',
          startMarker: '__OPSCLAW_CMD_START_test__',
        };
      },
      resumePendingExecutionWait() {
        resumeCalls += 1;
        pendingExecutionState = 'awaiting_human_input';
      },
      async executeCommand(
        _sessionId: string,
        command: string,
        options?: { signal?: AbortSignal }
      ) {
        return new Promise((resolve, reject) => {
          resolveCommand = resolve;
          rejectCommand = reject;
          if (options?.signal) {
            options.signal.addEventListener(
              'abort',
              () => {
                reject(new Error('interactive command aborted by stale signal'));
              },
              { once: true }
            );
          }
        }).then(result => ({
          ...(result as {
            sessionId: string;
            command: string;
            exitCode: number;
            output: string;
            truncated: boolean;
            startedAt: number;
            completedAt: number;
            durationMs: number;
          }),
          command,
        }));
      },
    } as never,
    completeAgentContext: async () => {
      completionCalls += 1;
      if (completionCalls === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: 'sudo passwd root',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '密码已经设置完成。' }],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '设置 root 密码',
      sessionId: 'session-1',
    },
    event => {
      initialEvents.push(event);
      if (
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'human_gate_opened'
      ) {
        initialController.abort();
      }
    },
    initialController.signal
  );

  const openedGateEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_opened'
  ) as { runId?: unknown; gate?: { id?: unknown } } | undefined;

  const runId = typeof openedGateEvent?.runId === 'string' ? openedGateEvent.runId : null;
  const gateId =
    openedGateEvent?.gate && typeof openedGateEvent.gate.id === 'string'
      ? openedGateEvent.gate.id
      : null;

  assert.ok(runId);
  assert.ok(gateId);
  assert.equal(
    initialEvents.some(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'run_failed'
    ),
    false
  );

  const snapshot = runtime.resumeWaiting(runId, gateId);
  assert.equal(snapshot?.state, 'waiting_for_human');

  const continuation = runtime.streamContinuation(
    runId,
    event => {
      resumedEvents.push(event);
    },
    new AbortController().signal
  );

  setTimeout(() => {
    pendingExecutionState = 'awaiting_human_input';
    resolveCommand?.({
      sessionId: 'session-1',
      command: 'sudo passwd root',
      exitCode: 0,
      output: 'password updated successfully',
      truncated: false,
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 42,
    });
  }, 10);

  await continuation;

  assert.equal(rejectCommand === null, false);
  assert.equal(
    resumedEvents.some(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'run_completed'
    ),
    true
  );
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'completed');
});

test('terminal_input gate 过期后若底层命令已自行完成，resumeWaiting 仍可继续推进 run', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const initialEvents: unknown[] = [];
  const resumedEvents: unknown[] = [];
  let completionCalls = 0;
  let pendingStateChecks = 0;
  let pendingExecutionState: 'awaiting_human_input' | 'suspended_waiting_for_input' | 'completed' =
    'awaiting_human_input';
  let commandCompleted = false;
  let resolveCommand:
    | ((value: {
        sessionId: string;
        command: string;
        exitCode: number;
        output: string;
        truncated: boolean;
        startedAt: number;
        completedAt: number;
        durationMs: number;
      }) => void)
    | null = null;

  const runtime = new OpsAgentRuntime({
    toolRegistry: registry,
    toolExecutor: new ToolExecutor(registry),
    fileMemory: {
      async readGlobalMemory() {
        return {
          scope: 'global',
          id: null,
          title: '全局记忆',
          path: '/tmp/MEMORY.md',
          content: '',
          exists: false,
          updatedAt: null,
        };
      },
    } as never,
    getNodeById() {
      return null;
    },
    sessions: {
      getSession(sessionId: string) {
        return {
          sessionId,
          nodeId: null,
          host: '10.0.0.8',
          port: 22,
          username: 'ubuntu',
          status: 'connected' as const,
        };
      },
      listSessions() {
        return [];
      },
      getTranscript() {
        return '';
      },
      getPendingExecutionDebug() {
        pendingStateChecks += 1;
        if (!commandCompleted && pendingStateChecks >= 2) {
          pendingExecutionState = 'suspended_waiting_for_input';
        }

        if (commandCompleted) {
          return null;
        }

        return {
          state: pendingExecutionState,
          command: 'sudo passwd root',
          startMarker: '__OPSCLAW_CMD_START_test__',
        };
      },
      resumePendingExecutionWait() {
        if (commandCompleted) {
          throw new Error('当前会话没有等待中的命令。');
        }

        pendingExecutionState = 'awaiting_human_input';
      },
      async executeCommand(_sessionId: string, command: string) {
        return new Promise((resolve) => {
          resolveCommand = resolve;
        }).then(result => ({
          ...(result as {
            sessionId: string;
            command: string;
            exitCode: number;
            output: string;
            truncated: boolean;
            startedAt: number;
            completedAt: number;
            durationMs: number;
          }),
          command,
        }));
      },
    } as never,
    completeAgentContext: async () => {
      completionCalls += 1;
      if (completionCalls === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: 'session.run_command',
              arguments: {
                sessionId: 'session-1',
                command: 'sudo passwd root',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '密码已经设置完成。' }],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '设置 root 密码',
      sessionId: 'session-1',
    },
    event => {
      initialEvents.push(event);
    },
    new AbortController().signal
  );

  const openedGateEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'human_gate_opened'
  ) as { runId?: unknown; gate?: { id?: unknown } } | undefined;

  const runId = typeof openedGateEvent?.runId === 'string' ? openedGateEvent.runId : null;
  const gateId =
    openedGateEvent?.gate && typeof openedGateEvent.gate.id === 'string'
      ? openedGateEvent.gate.id
      : null;

  assert.ok(runId);
  assert.ok(gateId);
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'suspended');

  commandCompleted = true;
  const finalizeCommand = resolveCommand;
  if (!finalizeCommand) {
    throw new Error('expected pending command resolver');
  }
  (finalizeCommand as (value: {
    sessionId: string;
    command: string;
    exitCode: number;
    output: string;
    truncated: boolean;
    startedAt: number;
    completedAt: number;
    durationMs: number;
  }) => void)({
    sessionId: 'session-1',
    command: 'sudo passwd root',
    exitCode: 0,
    output: 'password updated successfully',
    truncated: false,
    startedAt: Date.now(),
    completedAt: Date.now(),
    durationMs: 42,
  });

  const snapshot = runtime.resumeWaiting(runId, gateId);
  assert.equal(snapshot?.openGate?.status, 'open');

  await runtime.streamContinuation(
    runId,
    event => {
      resumedEvents.push(event);
    },
    new AbortController().signal
  );

  assert.equal(
    resumedEvents.some(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'run_completed'
    ),
    true
  );
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'completed');
});
