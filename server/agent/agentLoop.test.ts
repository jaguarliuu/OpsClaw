import assert from 'node:assert/strict';
import test from 'node:test';

import type { AssistantMessage, Context } from '@mariozechner/pi-ai';

import type { StoredLlmProvider } from '../llmProviderStore.js';
import {
  createAgentLoopState,
  resumeAgentLoop,
  runAgentLoop,
} from './agentLoop.js';
import { createToolRegistry } from './toolRegistry.js';
import { ToolExecutor } from './toolExecutor.js';
import type { ToolExecutionEnvelope } from './agentTypes.js';
import type { ToolPauseOutcome } from './toolTypes.js';
import { interactionToolProvider } from './tools/interactionProvider.js';
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

function createBaseContext(): Context {
  return {
    systemPrompt: 'test prompt',
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: '用户任务：检查磁盘空间' }],
        timestamp: Date.now(),
      },
    ],
    tools: [],
  };
}

function createBaseLoopOptions() {
  const registry = createToolRegistry();
  registry.registerProvider(sessionToolProvider);
  registry.registerProvider(interactionToolProvider);

  return {
    provider: createProvider(),
    model: 'qwen-plus',
    runId: 'run-1',
    task: '检查磁盘空间',
    sessionId: 'session-1',
    sessionLabel: 'ubuntu@10.0.0.8:22',
    sessionGroupName: null,
    approvalMode: 'auto-readonly' as const,
    maxCommandOutputChars: 4000,
    effectiveRules: {
      intents: {},
    },
    hardMaxSteps: 4,
    initialStepBudget: 4,
    context: createBaseContext(),
    toolRegistry: registry,
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
          output: '/dev/vda1  40G  18G  20G  48% /',
          durationMs: 50,
        };
      },
    } as never,
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
  };
}

test('agentLoop suppresses plain-text parameter questions and retries until the model uses interaction.request', async () => {
  const options = createBaseLoopOptions();
  const toolExecutor = new ToolExecutor(options.toolRegistry);
  let completionCalls = 0;

  const loopState = createAgentLoopState({
    ...options,
    toolExecutor,
    completeAgentContext: async () => {
      completionCalls += 1;

      if (completionCalls === 1) {
        return createAssistantMessage({
          stopReason: 'stop',
          content: [
            {
              type: 'text',
              text: '请提供新用户的用户名、密码，并确认授权方案后我再继续执行。',
            },
          ],
        });
      }

      return createAssistantMessage({
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
              ],
            },
          },
        ],
      });
    },
  });

  const { outcome, events } = await runAgentLoop(loopState, new AbortController().signal);

  assert.equal(completionCalls, 2);
  assert.equal(outcome.kind, 'paused');
  assert.equal(outcome.pause.interaction.source, 'user_interaction');
  assert.equal(
    events.some(
      (event) =>
        event.type === 'assistant_message' &&
        'text' in event &&
        typeof event.text === 'string' &&
        event.text.includes('请提供新用户的用户名')
    ),
    false
  );
  assert.equal(
    events.some(
      (event) =>
        event.type === 'tool_call' &&
        'toolName' in event &&
        event.toolName === 'interaction.request'
    ),
    true
  );
});

test('toolRegistry exposes model-facing tool names that satisfy OpenAI function naming rules', async () => {
  const options = createBaseLoopOptions();
  const tools = await options.toolRegistry.listPiTools({
    sessionId: 'session-1',
  });

  assert.ok(tools.length > 0);
  for (const tool of tools) {
    assert.match(tool.name, /^[a-zA-Z0-9_-]+$/);
  }

  assert.equal(tools.some((tool) => tool.name === 'session.run_command'), false);
});

test('agentLoop completes a tool-use step sequence and records stable observations', async () => {
  const options = createBaseLoopOptions();
  const completionContexts: Context[] = [];
  const toolExecutor = new ToolExecutor(options.toolRegistry);
  const eventTypes: string[] = [];

  const loopState = createAgentLoopState({
    ...options,
    toolExecutor,
    completeAgentContext: async (_provider, _model, context) => {
      completionContexts.push(context);

      if (completionContexts.length === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            { type: 'text', text: '先检查磁盘空间。' },
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

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '磁盘空间充足。' }],
      });
    },
  });

  const { outcome, events } = await runAgentLoop(
    loopState,
    new AbortController().signal
  );

  for (const event of events) {
    eventTypes.push(event.type);
  }

  assert.equal(outcome.kind, 'completed');
  assert.equal(outcome.finalAnswer, '磁盘空间充足。');
  assert.equal(outcome.steps, 2);
  assert.equal(outcome.stableObservations.length, 1);
  assert.equal(outcome.stableObservations[0]?.command, 'df -h');
  assert.deepEqual(eventTypes, [
    'assistant_message',
    'tool_call',
    'tool_execution_started',
    'tool_execution_finished',
    'assistant_message',
  ]);
});

test('agentLoop accepts model-safe tool names and still executes the canonical session.run_command handler', async () => {
  const options = createBaseLoopOptions();
  options.context.tools = await options.toolRegistry.listPiTools({
    sessionId: 'session-1',
  });
  const completionContexts: Context[] = [];
  const toolExecutor = new ToolExecutor(options.toolRegistry);
  const events: Array<{ type: string; toolName?: string }> = [];

  const loopState = createAgentLoopState({
    ...options,
    toolExecutor,
    completeAgentContext: async (_provider, _model, context) => {
      completionContexts.push(context);
      const modelToolName = context.tools?.find((tool) =>
        tool.description.includes('执行一条 shell 命令')
      )?.name;
      assert.ok(modelToolName);
      assert.match(modelToolName, /^[a-zA-Z0-9_-]+$/);

      if (completionContexts.length === 1) {
        return createAssistantMessage({
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              id: 'call-1',
              name: modelToolName,
              arguments: {
                sessionId: 'session-1',
                command: 'df -h',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '磁盘空间充足。' }],
      });
    },
  });

  const { outcome, events: runtimeEvents } = await runAgentLoop(
    loopState,
    new AbortController().signal
  );

  for (const event of runtimeEvents) {
    events.push(
      typeof event === 'object' && event !== null && 'type' in event
        ? {
            type: String((event as { type?: unknown }).type ?? ''),
            toolName:
              'toolName' in event && typeof (event as { toolName?: unknown }).toolName === 'string'
                ? (event as { toolName: string }).toolName
                : undefined,
          }
        : { type: 'unknown' }
    );
  }

  assert.equal(outcome.kind, 'completed');
  assert.equal(
    events.some((event) => event.type === 'tool_call' && event.toolName === 'session.run_command'),
    true
  );
  assert.equal(
    events.some(
      (event) =>
        event.type === 'tool_execution_finished' && event.toolName === 'session.run_command'
    ),
    true
  );
});

test('agentLoop returns a resumable pause when tool execution requires HITL', async () => {
  const options = createBaseLoopOptions();
  const envelope: ToolExecutionEnvelope = {
    toolName: 'session.run_command',
    toolCallId: 'call-1',
    ok: true,
    data: {
      command: 'df -h',
      exitCode: 0,
      output: '/dev/vda1  40G  18G  20G  48% /',
      durationMs: 50,
    },
    meta: {
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 50,
    },
  };
  let toolExecutorCalls = 0;
  const pause: ToolPauseOutcome = {
    kind: 'pause',
    interaction: {
      source: 'policy_approval',
      context: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        arguments: {
          sessionId: 'session-1',
          command: 'df -h',
        },
        policy: {
          action: 'require_approval',
          matches: [],
        },
      },
    },
    continuation: {
      resume: async () => envelope,
      reject: () => ({
        ...envelope,
        ok: false,
        error: {
          code: 'approval_rejected',
          message: 'rejected',
          retryable: false,
        },
      }),
    },
  };
  const eventTypes: string[] = [];
  let completionCalls = 0;

  const loopState = createAgentLoopState({
    ...options,
    toolExecutor: {
      async executeToolCall() {
        toolExecutorCalls += 1;
        return pause;
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
                command: 'df -h',
              },
            },
          ],
        });
      }

      return createAssistantMessage({
        stopReason: 'stop',
        content: [{ type: 'text', text: '已恢复并完成。' }],
      });
    },
  });

  const pausedResult = await runAgentLoop(
    loopState,
    new AbortController().signal
  );

  for (const event of pausedResult.events) {
    eventTypes.push(event.type);
  }

  const pausedOutcome = pausedResult.outcome;
  assert.equal(pausedOutcome.kind, 'paused');
  assert.equal(pausedOutcome.pause, pause);
  assert.equal(toolExecutorCalls, 1);
  assert.deepEqual(eventTypes, ['tool_call']);

  const resumed = await resumeAgentLoop(
    loopState,
    envelope,
    new AbortController().signal
  );

  assert.equal(resumed.outcome.kind, 'completed');
});
