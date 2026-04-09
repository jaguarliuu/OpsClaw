import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Type,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
} from '@mariozechner/pi-ai';

import type { StoredLlmProvider } from '../llmProviderStore.js';
import type { AgentStreamEvent, CreateAgentRunInput } from './agentTypes.js';
import { createAgentRunRegistry } from './agentRunRegistry.js';
import { createToolRegistry } from './toolRegistry.js';
import { ToolExecutor } from './toolExecutor.js';
import { OpsAgentRuntime } from './agentRuntime.js';
import { sessionToolProvider } from './tools/sessionProvider.js';
import type { ToolHandler, ToolPauseOutcome } from './toolTypes.js';

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

function createRunInput(): CreateAgentRunInput {
  return {
    providerId: 'provider-1',
    provider: createProvider(),
    model: 'qwen-plus',
    task: '创建一个 root 权限用户',
    sessionId: 'session-1',
    approvalMode: 'manual-sensitive',
  };
}

function createRuntimeForParameterPause() {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  let completionCalls = 0;

  return new OpsAgentRuntime({
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
          sessionId: 'session-1',
          command,
          exitCode: 0,
          output: 'user created',
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
                command: 'sudo adduser adminuser',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '用户已创建。' }],
      });
    },
  });
}

function createRuntimeForModelInteractionRequest() {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const interactionRequestTool: ToolHandler = {
    definition: {
      name: 'interaction.request',
      description: '向用户请求参数、选择或确认，并等待用户提交。',
      parameters: Type.Object({
        kind: Type.String(),
        title: Type.String(),
        message: Type.String(),
        fields: Type.Array(
          Type.Object({
            type: Type.String(),
            key: Type.String(),
            label: Type.Optional(Type.String()),
            required: Type.Optional(Type.Boolean()),
            options: Type.Optional(
              Type.Array(
                Type.Object({
                  label: Type.String(),
                  value: Type.String(),
                })
              )
            ),
          })
        ),
      }),
      category: 'orchestration',
      riskLevel: 'safe',
      concurrencyMode: 'serial',
      version: '1.0.0',
      tags: ['interaction'],
    },
    async execute() {
      return {
        kind: 'pause',
        interaction: {
          source: 'user_interaction',
          context: {
            toolCallId: 'call-1',
            toolName: 'interaction.request',
            interactionKind: 'collect_input',
            riskLevel: 'medium',
            blockingMode: 'soft_block',
            title: '确认 root 用户参数',
            message: '继续前需要你确认用户名、密码和授权方案。',
            fields: [
              {
                type: 'text',
                key: 'username',
                label: '用户名',
                required: true,
              },
              {
                type: 'password',
                key: 'password',
                label: '密码',
                required: true,
              },
              {
                type: 'single_select',
                key: 'grantMode',
                label: '授权方案',
                required: true,
                options: [
                  { label: 'sudo组', value: 'sudo-group' },
                  { label: '无密码sudo', value: 'passwordless-sudo' },
                ],
              },
            ],
            actions: [
              {
                id: 'submit',
                label: '提交并继续',
                kind: 'submit',
                style: 'primary',
              },
              {
                id: 'reject',
                label: '取消',
                kind: 'reject',
                style: 'secondary',
              },
            ],
            metadata: {
              sourceIntent: 'user_management',
            },
          },
        },
        continuation: {
          resume: async () => ({
            toolName: 'interaction.request',
            toolCallId: 'call-1',
            ok: true,
            data: {
              acknowledged: true,
            },
            meta: {
              startedAt: Date.now(),
              completedAt: Date.now(),
              durationMs: 0,
            },
          }),
          reject: () => ({
            toolName: 'interaction.request',
            toolCallId: 'call-1',
            ok: false,
            error: {
              code: 'interaction_rejected',
              message: '用户取消了交互请求。',
              retryable: false,
            },
            meta: {
              startedAt: Date.now(),
              completedAt: Date.now(),
              durationMs: 0,
            },
          }),
        },
      } as never as ToolPauseOutcome;
    },
  };

  registry.register(interactionRequestTool);

  return new OpsAgentRuntime({
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
          sessionId: 'session-1',
          command,
          exitCode: 0,
          output: 'ok',
          truncated: false,
          startedAt: Date.now(),
          completedAt: Date.now(),
          durationMs: 5,
        };
      },
    } as never,
    completeAgentContext: async () =>
      createAssistantMessage({
        stopReason: 'toolUse',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'interaction.request',
            arguments: {
              kind: 'collect_input',
              title: '确认 root 用户参数',
              message: '继续前需要你确认用户名、密码和授权方案。',
              fields: [
                {
                  type: 'text',
                  key: 'username',
                  label: '用户名',
                  required: true,
                },
                {
                  type: 'password',
                  key: 'password',
                  label: '密码',
                  required: true,
                },
                {
                  type: 'single_select',
                  key: 'grantMode',
                  label: '授权方案',
                  required: true,
                  options: [
                    { label: 'sudo组', value: 'sudo-group' },
                    { label: '无密码sudo', value: 'passwordless-sudo' },
                  ],
                },
              ],
            },
          },
        ],
      }),
  });
}

test('parameter collection pause opens a collect_input interaction', async () => {
  const runtime = createRuntimeForParameterPause();
  const events: AgentStreamEvent[] = [];

  await runtime.run(createRunInput(), event => {
    events.push(event);
  }, AbortSignal.timeout(5_000));

  const opened = events.find((event) => event.type === 'interaction_requested');
  assert.ok(opened && opened.type === 'interaction_requested');
  assert.equal(opened.request.interactionKind, 'collect_input');
  assert.equal(opened.request.actions.map((action) => action.kind).join(','), 'submit,reject');
});

test('submitInteraction rejects actions that are not offered by the current interaction', async () => {
  const runtime = createRuntimeForParameterPause();
  const events: AgentStreamEvent[] = [];

  await runtime.run(createRunInput(), event => {
    events.push(event);
  }, AbortSignal.timeout(5_000));

  const opened = events.find((event) => event.type === 'interaction_requested');
  assert.ok(opened && opened.type === 'interaction_requested');
  assert.equal(opened.request.interactionKind, 'collect_input');

  assert.throws(
    () =>
      runtime.submitInteraction(opened.runId, opened.request.id, {
        selectedAction: 'approve',
        payload: {},
      }),
    /不支持|未提供|action/i
  );
  assert.equal(runtime.getRunSnapshot(opened.runId)?.activeInteraction?.status, 'open');
});

test('model-initiated interaction.request tool opens a native collect_input interaction card', async () => {
  const runtime = createRuntimeForModelInteractionRequest();
  const events: AgentStreamEvent[] = [];

  await runtime.run(createRunInput(), event => {
    events.push(event);
  }, AbortSignal.timeout(5_000));

  const opened = events.find((event) => event.type === 'interaction_requested');
  assert.ok(opened && opened.type === 'interaction_requested');
  assert.equal(opened.request.interactionKind, 'collect_input');
  assert.equal(opened.request.title, '确认 root 用户参数');
  assert.equal(opened.request.fields.length, 3);
  assert.equal(opened.request.fields[0]?.type, 'text');
  assert.equal(opened.request.fields[1]?.type, 'password');
  assert.equal(opened.request.fields[2]?.type, 'single_select');
});

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

test('长时间运行的工具调用会在完成前先把中间事件发给 runtime emit', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  let resolveCommand!: (value: {
    command: string;
    exitCode: number;
    output: string;
    durationMs: number;
  }) => void;
  let notifyCommandStarted: (() => void) | null = null;
  const started = new Promise<void>((resolve) => {
    notifyCommandStarted = resolve;
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
      async executeCommand() {
        notifyCommandStarted?.();
        return new Promise((resolve) => {
          resolveCommand = resolve;
        });
      },
    } as never,
    completeAgentContext: async (_provider, _model, context) => {
      if (context.messages.some((message) => message.role === 'toolResult')) {
        return createAssistantMessage({
          stopReason: 'stop',
          content: [{ type: 'text', text: '检查完成。' }],
        });
      }

      return createAssistantMessage({
        stopReason: 'toolUse',
        content: [
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'session.run_command',
            arguments: {
              sessionId: 'session-1',
              command: 'sleep 5 && echo done',
            },
          },
        ],
      });
    },
  });

  const events: string[] = [];
  const runPromise = runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '等待命令完成',
      sessionId: 'session-1',
    },
    (event) => {
      events.push(event.type);
    },
    new AbortController().signal
  );

  let assertionError: unknown = null;

  try {
    await started;
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(events.includes('tool_call'));
    assert.ok(events.includes('tool_execution_started'));
    assert.ok(!events.includes('tool_execution_finished'));
  } catch (error) {
    assertionError = error;
  } finally {
    resolveCommand({
      command: 'sleep 5 && echo done',
      exitCode: 0,
      output: 'done',
      durationMs: 5000,
    });
    await runPromise;
  }

  if (assertionError) {
    throw assertionError;
  }
});

test('getSessionReattachableRun returns the latest suspended or waiting snapshot for a session', () => {
  const agentRunRegistry = createAgentRunRegistry();
  agentRunRegistry.registerRun({
    runId: 'run-1',
    sessionId: 'session-1',
    task: 'older run',
  });
  const request = agentRunRegistry.openInteraction({
    runId: 'run-1',
    sessionId: 'session-1',
    request: {
      id: 'interaction-1',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'open',
      interactionKind: 'terminal_wait',
      riskLevel: 'medium',
      blockingMode: 'hard_block',
      title: '等待终端交互',
      message: '命令正在等待用户在终端中继续输入。',
      schemaVersion: 'v1',
      fields: [{ type: 'display', key: 'command', value: 'sudo passwd root' }],
      actions: [
        {
          id: 'continue_waiting',
          label: '继续等待',
          kind: 'continue_waiting',
          style: 'primary',
        },
      ],
      openedAt: 1,
      deadlineAt: 1_700_000_000_000,
      metadata: {
        source: 'terminal_wait',
        timeoutMs: 300000,
        commandPreview: 'sudo passwd root',
      },
    },
  });
  agentRunRegistry.expireInteraction({ runId: 'run-1', interactionId: request.id });

  const runtime = new OpsAgentRuntime({
    agentRunRegistry,
    toolRegistry: createToolRegistry(),
    toolExecutor: {} as never,
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
      getSession() {
        return null;
      },
    } as never,
  });

  assert.equal(runtime.getSessionReattachableRun('session-1')?.runId, 'run-1');
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

      if (completionCount <= 13) {
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
      task: '执行一个需要超过默认初始预算的复杂诊断',
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

test('未显式传入 maxSteps 时会使用提升后的默认总预算完成更复杂的任务', async () => {
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
                command: `echo default-budget-step-${completionCount}`,
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
            text: '默认预算下的复杂任务完成。',
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
      task: '执行超过旧默认预算的新复杂任务',
      sessionId: 'session-1',
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

test('agent runtime injects cached session system info into the initial agent context', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

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
          systemInfo: {
            distributionId: 'ubuntu',
            versionId: '22.04',
            packageManager: 'apt',
            kernel: '6.8.0-40-generic',
            architecture: 'x86_64',
            defaultShell: '/bin/bash',
          },
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
          command: 'true',
          exitCode: 0,
          output: '',
          durationMs: 1,
        };
      },
    } as never,
    completeAgentContext: async (_provider, _model, context) => {
      completionContexts.push(context);
      return createAssistantMessage({
        stopReason: 'stop',
        content: [
          {
            type: 'text',
            text: '读取完成。',
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
      task: '读取当前会话上下文',
      sessionId: 'session-1',
    },
    () => {},
    new AbortController().signal
  );

  assert.equal(completionContexts.length > 0, true);
  assert.match(completionContexts[0]?.systemPrompt ?? '', /发行版：ubuntu 22\.04/);

  const firstMessage = completionContexts[0]?.messages[0];
  assert.equal(firstMessage?.role, 'user');
  assert.match(JSON.stringify(firstMessage?.content ?? []), /包管理器：apt/);
  assert.match(JSON.stringify(firstMessage?.content ?? []), /默认 shell：\/bin\/bash/);
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

test('交互式 session 输入会打开 terminal_wait interaction 并在超时后挂起 run', async () => {
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

  const interactionRequested = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as
    | {
        request?: {
          interactionKind?: unknown;
          fields?: Array<{ key?: unknown; value?: unknown }>;
          metadata?: { sessionLabel?: unknown };
        };
      }
    | undefined;

  const interactionExpired = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_expired'
  ) as { request?: { status?: unknown } } | undefined;

  const runStates = events
    .filter(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'run_state_changed'
    )
    .map(event => (event as { state?: unknown }).state);
  const waitingStateEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'run_state_changed' &&
      (event as { state?: unknown }).state === 'waiting_for_human'
  ) as
    | {
        executionState?: unknown;
        blockingMode?: unknown;
      }
    | undefined;

  assert.equal(interactionRequested?.request?.interactionKind, 'terminal_wait');
  assert.equal(interactionRequested?.request?.fields?.[0]?.key, 'command');
  assert.equal(interactionRequested?.request?.fields?.[0]?.value, 'sudo passwd root');
  assert.equal(interactionRequested?.request?.metadata?.sessionLabel, 'ubuntu@10.0.0.8:22');
  assert.equal(interactionExpired?.request?.status, 'expired');
  assert.equal(waitingStateEvent?.executionState, 'blocked_by_terminal');
  assert.equal(waitingStateEvent?.blockingMode, 'terminal_wait');
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

test('交互式 session 等待期间如果命令上下文丢失会拒绝 terminal_wait interaction 并让 run_failed', async () => {
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

  const rejectedInteractionEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_rejected'
  ) as { request?: { status?: unknown } } | undefined;
  const runFailedEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'run_failed'
  ) as { error?: unknown } | undefined;

  assert.equal(rejectedInteractionEvent?.request?.status, 'rejected');
  assert.equal(runFailedEvent?.error, 'SSH 会话已关闭，交互式命令上下文丢失。');
  assert.equal(
    events.some(
      event =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        (event as { type?: unknown }).type === 'interaction_resolved'
    ),
    false
  );
});

test('命中敏感命令策略时 approval interaction 会打开并等待而不是走旧失败事件路径', async () => {
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

  const approvalInteractionEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as
    | {
        request?: {
          interactionKind?: unknown;
          message?: unknown;
          metadata?: {
            policyAction?: unknown;
            policyMatches?: Array<{ ruleId?: unknown; title?: unknown }>;
          };
        };
      }
    | undefined;
  const legacyApprovalRequiredEvent = events.find(
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
  const toolStartedEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'tool_execution_started'
  );
  const waitingStateEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'run_state_changed' &&
      (event as { state?: unknown }).state === 'waiting_for_human'
  ) as
    | {
        executionState?: unknown;
        blockingMode?: unknown;
      }
    | undefined;

  assert.equal(approvalInteractionEvent?.request?.interactionKind, 'approval');
  assert.equal(
    approvalInteractionEvent?.request?.message,
    '命令命中敏感操作策略，需要用户审批后执行。'
  );
  assert.equal(
    (approvalInteractionEvent?.request?.metadata as { policyAction?: unknown } | undefined)
      ?.policyAction,
    'require_approval'
  );
  assert.equal(
    (
      approvalInteractionEvent?.request?.metadata as {
        policyMatches?: Array<{ ruleId?: unknown; title?: unknown }>;
      } | undefined
    )?.policyMatches?.[0]?.ruleId,
    'service.restart'
  );
  assert.equal(
    (
      approvalInteractionEvent?.request?.metadata as {
        policyMatches?: Array<{ ruleId?: unknown; title?: unknown }>;
      } | undefined
    )?.policyMatches?.[0]?.title,
    '服务重启'
  );
  assert.equal(waitingStateEvent !== undefined, true);
  assert.equal(waitingStateEvent?.executionState, 'blocked_by_interaction');
  assert.equal(waitingStateEvent?.blockingMode, 'interaction');
  assert.equal(legacyApprovalRequiredEvent === undefined, true);
  assert.equal(toolStartedEvent === undefined, true);
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

test('open approval interaction keeps mutation blocked until the interaction is submitted', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const events: unknown[] = [];
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
          sessionId: 'session-1',
          command: 'systemctl restart nginx',
          exitCode: 0,
          output: '',
          truncated: false,
          startedAt: 1,
          completedAt: 2,
          durationMs: 1,
        };
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

  const openedInteractionEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { runId?: unknown; request?: { id?: unknown; interactionKind?: unknown } } | undefined;
  const runId =
    typeof openedInteractionEvent?.runId === 'string' ? openedInteractionEvent.runId : null;

  assert.ok(runId);
  assert.equal(openedInteractionEvent?.request?.interactionKind, 'approval');
  assert.equal(runtime.getRunSnapshot(runId)?.executionState, 'blocked_by_interaction');
  assert.equal(runtime.getRunSnapshot(runId)?.blockingMode, 'interaction');
  assert.equal(executeCalls, 0);
  await assert.rejects(
    runtime.streamContinuation(
      runId,
      () => {},
      new AbortController().signal
    ),
    /gate 动作/
  );
  assert.equal(executeCalls, 0);
});

test('manual-sensitive 下交互式 passwd 命令会先打开 approval interaction', async () => {
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
        throw new Error('should not execute before approval');
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
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { request?: { interactionKind?: unknown; message?: unknown } } | undefined;

  assert.equal(approvalEvent?.request?.interactionKind, 'approval');
  assert.equal(approvalEvent?.request?.message, '该操作需要用户审批后执行。');
});

test('提交 continue_waiting 会继续等待同一个 terminal_wait interaction 并让原始 run 自然完成', async () => {
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

  const openedInteractionEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { runId?: unknown; request?: { id?: unknown } } | undefined;

  const runId =
    typeof openedInteractionEvent?.runId === 'string' ? openedInteractionEvent.runId : null;
  const requestId =
    openedInteractionEvent?.request && typeof openedInteractionEvent.request.id === 'string'
      ? openedInteractionEvent.request.id
      : null;

  assert.ok(runId);
  assert.ok(requestId);

  const snapshot = runtime.submitInteraction(runId, requestId, {
    selectedAction: 'continue_waiting',
    payload: {},
  });
  assert.equal(snapshot?.state, 'waiting_for_human');
  assert.equal(snapshot?.activeInteraction?.status, 'open');
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

  const resolvedInteractionEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_resolved'
  ) as { request?: { status?: unknown } } | undefined;
  const toolFinishedEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'tool_execution_finished'
  ) as { result?: { ok?: unknown } } | undefined;

  assert.equal(resolvedInteractionEvent?.request?.status, 'resolved');
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

test('提交确认字段后会恢复 parameter_confirmation interaction，并在需要时继续进入 approval interaction', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const initialEvents: unknown[] = [];
  const resumedEvents: unknown[] = [];
  let completionCalls = 0;
  let executeCalls = 0;
  let executedCommand: string | null = null;

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
        executeCalls += 1;
        executedCommand = command;
        return {
          sessionId: 'session-1',
          command,
          exitCode: 0,
          output: 'user created',
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
                command: 'sudo adduser adminuser',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '用户已创建。' }],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '创建一个 root 权限用户',
      sessionId: 'session-1',
      approvalMode: 'manual-sensitive',
    },
    event => {
      initialEvents.push(event);
    },
    new AbortController().signal
  );

  const openedInteractionEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as
    | {
        runId?: unknown;
        request?: {
          id?: unknown;
          interactionKind?: unknown;
          metadata?: { commandPreview?: unknown };
          fields?: Array<{
            key?: unknown;
            label?: unknown;
            value?: unknown;
          }>;
        };
      }
    | undefined;

  const runId =
    typeof openedInteractionEvent?.runId === 'string' ? openedInteractionEvent.runId : null;
  const requestId =
    openedInteractionEvent?.request && typeof openedInteractionEvent.request.id === 'string'
      ? openedInteractionEvent.request.id
      : null;

  assert.ok(runId);
  assert.ok(requestId);
  assert.equal(openedInteractionEvent?.request?.interactionKind, 'collect_input');
  assert.equal(openedInteractionEvent?.request?.metadata?.commandPreview, 'sudo adduser adminuser');
  assert.deepEqual(openedInteractionEvent?.request?.fields, [
    {
      type: 'text',
      key: 'username',
      label: '用户名',
      required: true,
      value: 'adminuser',
    },
  ]);
  assert.equal(executeCalls, 0);
  assert.equal(executedCommand, null);

  const snapshot = runtime.submitInteraction(runId, requestId, {
    selectedAction: 'submit',
    payload: {
      fields: {
        username: 'ops-admin',
      },
    },
  });
  assert.equal(snapshot?.activeInteraction?.status, 'resolved');
  assert.equal(snapshot?.state, 'suspended');

  await runtime.streamContinuation(
    runId,
    event => {
      resumedEvents.push(event);
    },
    new AbortController().signal
  );

  const approvalInteractionEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested' &&
      (event as { request?: { interactionKind?: unknown } }).request?.interactionKind ===
        'approval'
  ) as
    | {
        request?: {
          message?: unknown;
          metadata?: {
            commandPreview?: unknown;
          };
        };
      }
    | undefined;

  assert.equal(approvalInteractionEvent?.request?.message, '该操作需要用户审批后执行。');
  assert.equal(
    approvalInteractionEvent?.request?.metadata?.commandPreview,
    'sudo adduser ops-admin'
  );
  assert.equal(executeCalls, 0);
  assert.equal(executedCommand, null);
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'waiting_for_human');
});

test('显式提供用户名的 user_management 命令会先打开 approval interaction 而不是直接执行', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const events: unknown[] = [];
  let executeCalls = 0;
  let executedCommand: string | null = null;

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
        executeCalls += 1;
        executedCommand = command;
        return {
          sessionId: 'session-1',
          command,
          exitCode: 0,
          output: 'user created',
          truncated: false,
          startedAt: Date.now(),
          completedAt: Date.now(),
          durationMs: 5,
        };
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
              command: 'sudo adduser ops-admin',
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
      task: '创建一个 root 权限用户，用户名叫 ops-admin',
      sessionId: 'session-1',
      approvalMode: 'manual-sensitive',
    },
    event => {
      events.push(event);
    },
    new AbortController().signal
  );

  const openedInteractionEvent = events.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { request?: { interactionKind?: unknown; message?: unknown } } | undefined;

  assert.equal(openedInteractionEvent?.request?.interactionKind, 'approval');
  assert.equal(openedInteractionEvent?.request?.message, '该操作需要用户审批后执行。');
  assert.equal(executeCalls, 0);
  assert.equal(executedCommand, null);
});

test('parameter_confirmation 确认后若仍需审批，会先转成 approval interaction 再执行', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const initialEvents: unknown[] = [];
  const approvalEvents: unknown[] = [];
  const resumedEvents: unknown[] = [];
  let completionCalls = 0;
  let executeCalls = 0;
  let executedCommand: string | null = null;

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
        executeCalls += 1;
        executedCommand = command;
        return {
          sessionId: 'session-1',
          command,
          exitCode: 0,
          output: 'user created',
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
                command: 'sudo adduser adminuser',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '用户已创建。' }],
      });
    },
  });

  await runtime.run(
    {
      providerId: 'provider-1',
      provider: createProvider(),
      model: 'qwen-plus',
      task: '创建一个 root 权限用户',
      sessionId: 'session-1',
      approvalMode: 'manual-sensitive',
    },
    event => {
      initialEvents.push(event);
    },
    new AbortController().signal
  );

  const parameterInteractionEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { runId?: unknown; request?: { id?: unknown; interactionKind?: unknown } } | undefined;

  const runId =
    typeof parameterInteractionEvent?.runId === 'string'
      ? parameterInteractionEvent.runId
      : null;
  const requestId =
    parameterInteractionEvent?.request &&
    typeof parameterInteractionEvent.request.id === 'string'
      ? parameterInteractionEvent.request.id
      : null;

  assert.ok(runId);
  assert.ok(requestId);
  assert.equal(parameterInteractionEvent?.request?.interactionKind, 'collect_input');
  assert.equal(executeCalls, 0);

  runtime.submitInteraction(runId, requestId, {
    selectedAction: 'submit',
    payload: {
      fields: {
        username: 'ops-admin',
      },
    },
  });

  await runtime.streamContinuation(
    runId,
    event => {
      approvalEvents.push(event);
    },
    new AbortController().signal
  );

  const approvalInteractionEvent = approvalEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested' &&
      (event as { request?: { interactionKind?: unknown } }).request?.interactionKind ===
        'approval'
  ) as { request?: { id?: unknown; message?: unknown } } | undefined;

  const approvalRequestId =
    approvalInteractionEvent?.request &&
    typeof approvalInteractionEvent.request.id === 'string'
      ? approvalInteractionEvent.request.id
      : null;

  assert.equal(approvalInteractionEvent?.request?.message, '该操作需要用户审批后执行。');
  assert.ok(approvalRequestId);
  assert.equal(executeCalls, 0);
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'waiting_for_human');

  runtime.submitInteraction(runId, approvalRequestId, {
    selectedAction: 'approve',
    payload: {},
  });

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
  ) as { result?: { ok?: unknown } } | undefined;

  assert.equal(toolFinishedEvent?.result?.ok, true);
  assert.equal(executeCalls, 1);
  assert.equal(executedCommand, 'sudo adduser ops-admin');
});

test('approval interaction 确认后会回到运行态并继续执行原始工具调用', async () => {
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

  const openedInteractionEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { runId?: unknown; request?: { id?: unknown } } | undefined;

  const runId =
    typeof openedInteractionEvent?.runId === 'string' ? openedInteractionEvent.runId : null;
  const requestId =
    openedInteractionEvent?.request && typeof openedInteractionEvent.request.id === 'string'
      ? openedInteractionEvent.request.id
      : null;

  assert.ok(runId);
  assert.ok(requestId);

  const snapshot = runtime.submitInteraction(runId, requestId, {
    selectedAction: 'approve',
    payload: {},
  });
  assert.equal(snapshot?.activeInteraction?.status, 'resolved');
  assert.equal(snapshot?.state, 'suspended');

  await runtime.streamContinuation(
    runId,
    event => {
      resumedEvents.push(event);
    },
    new AbortController().signal
  );

  const resolvedInteractionEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_resolved'
  ) as { request?: { status?: unknown } } | undefined;
  const toolFinishedEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'tool_execution_finished'
  ) as { result?: { ok?: unknown } } | undefined;

  assert.equal(resolvedInteractionEvent?.request?.status, 'resolved');
  assert.equal(toolFinishedEvent?.result?.ok, true);
  assert.equal(executeCalls, 1);
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'completed');
});

test('reject interaction 会把 approval interaction 转成结构化拒绝结果并继续推进 run', async () => {
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

  const openedInteractionEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { runId?: unknown; request?: { id?: unknown } } | undefined;

  const runId =
    typeof openedInteractionEvent?.runId === 'string' ? openedInteractionEvent.runId : null;
  const requestId =
    openedInteractionEvent?.request && typeof openedInteractionEvent.request.id === 'string'
      ? openedInteractionEvent.request.id
      : null;

  assert.ok(runId);
  assert.ok(requestId);

  const snapshot = runtime.submitInteraction(runId, requestId, {
    selectedAction: 'reject',
    payload: {},
  });
  assert.equal(snapshot?.activeInteraction?.status, 'rejected');
  assert.equal(snapshot?.state, 'suspended');

  await runtime.streamContinuation(
    runId,
    event => {
      resumedEvents.push(event);
    },
    new AbortController().signal
  );

  const rejectedInteractionEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_rejected'
  ) as { request?: { status?: unknown } } | undefined;
  const toolFinishedEvent = resumedEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'tool_execution_finished'
  ) as { result?: { ok?: unknown; error?: { code?: unknown } } } | undefined;

  assert.equal(rejectedInteractionEvent?.request?.status, 'rejected');
  assert.equal(toolFinishedEvent?.result?.ok, false);
  assert.equal(toolFinishedEvent?.result?.error?.code, 'approval_rejected');
  assert.equal(executeCalls, 0);
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'completed');
});

test('approval interaction 会在原始请求已 abort 后改用 continuation signal 执行工具', async () => {
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
        (event as { type?: unknown }).type === 'interaction_requested'
      ) {
        initialController.abort();
      }
    },
    initialController.signal
  );

  const openedInteractionEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { runId?: unknown; request?: { id?: unknown } } | undefined;

  const runId =
    typeof openedInteractionEvent?.runId === 'string' ? openedInteractionEvent.runId : null;
  const requestId =
    openedInteractionEvent?.request && typeof openedInteractionEvent.request.id === 'string'
      ? openedInteractionEvent.request.id
      : null;

  assert.ok(runId);
  assert.ok(requestId);

  const snapshot = runtime.submitInteraction(runId, requestId, {
    selectedAction: 'approve',
    payload: {},
  });
  assert.equal(snapshot?.activeInteraction?.status, 'resolved');

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

test('approval continuation 若在恢复后抛出异常，会保留可检查的暂停上下文', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);

  const initialEvents: unknown[] = [];
  let completionCalls = 0;
  let allowCompletion = false;
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

      if (!allowCompletion) {
        throw new Error('resume follow-up failed');
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

  const openedInteractionEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { runId?: unknown; request?: { id?: unknown } } | undefined;

  const runId =
    typeof openedInteractionEvent?.runId === 'string' ? openedInteractionEvent.runId : null;
  const requestId =
    openedInteractionEvent?.request && typeof openedInteractionEvent.request.id === 'string'
      ? openedInteractionEvent.request.id
      : null;

  assert.ok(runId);
  assert.ok(requestId);

  runtime.submitInteraction(runId, requestId, {
    selectedAction: 'approve',
    payload: {},
  });

  await assert.rejects(
    runtime.streamContinuation(
      runId,
      () => {},
      new AbortController().signal
    ),
    /resume follow-up failed/
  );

  const failedSnapshot = runtime.getRunSnapshot(runId);
  assert.equal(failedSnapshot?.state, 'running');
  assert.equal(failedSnapshot?.activeInteraction?.status, 'resolved');

  allowCompletion = true;

  await runtime.streamContinuation(
    runId,
    () => {},
    new AbortController().signal
  );

  assert.equal(executeCalls, 2);
  assert.equal(runtime.getRunSnapshot(runId)?.state, 'completed');
});

test('terminal_wait interaction 在原始请求已 abort 后仍可通过 continuation signal 恢复并完成', async () => {
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
        (event as { type?: unknown }).type === 'interaction_requested'
      ) {
        initialController.abort();
      }
    },
    initialController.signal
  );

  const openedInteractionEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { runId?: unknown; request?: { id?: unknown } } | undefined;

  const runId =
    typeof openedInteractionEvent?.runId === 'string' ? openedInteractionEvent.runId : null;
  const requestId =
    openedInteractionEvent?.request && typeof openedInteractionEvent.request.id === 'string'
      ? openedInteractionEvent.request.id
      : null;

  assert.ok(runId);
  assert.ok(requestId);
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

  const snapshot = runtime.submitInteraction(runId, requestId, {
    selectedAction: 'continue_waiting',
    payload: {},
  });
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

test('terminal_wait interaction 过期后若底层命令已自行完成，continue_waiting 仍可继续推进 run', async () => {
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

  const openedInteractionEvent = initialEvents.find(
    event =>
      typeof event === 'object' &&
      event !== null &&
      'type' in event &&
      (event as { type?: unknown }).type === 'interaction_requested'
  ) as { runId?: unknown; request?: { id?: unknown } } | undefined;

  const runId =
    typeof openedInteractionEvent?.runId === 'string' ? openedInteractionEvent.runId : null;
  const requestId =
    openedInteractionEvent?.request && typeof openedInteractionEvent.request.id === 'string'
      ? openedInteractionEvent.request.id
      : null;

  assert.ok(runId);
  assert.ok(requestId);
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

  const snapshot = runtime.submitInteraction(runId, requestId, {
    selectedAction: 'continue_waiting',
    payload: {},
  });
  assert.equal(snapshot?.activeInteraction?.status, 'open');

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
