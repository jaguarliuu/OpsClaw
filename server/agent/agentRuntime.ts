import { randomUUID } from 'node:crypto';

import {
  validateToolCall,
  type AssistantMessage,
  type Context,
  type ToolCall,
  type ToolResultMessage,
} from '@mariozechner/pi-ai';

import { completeAgentContext, streamAgentContext } from '../llmClient.js';
import type { CreateAgentRunInput, AgentStreamEvent, ToolExecutionEnvelope } from './agentTypes.js';
import type { FileMemoryStore } from './fileMemoryStore.js';
import { logAgent } from './logger.js';
import type { StoredNodeDetail } from '../nodeStore.js';
import { buildAgentSystemPrompt } from './agentPrompt.js';
import { ToolExecutor } from './toolExecutor.js';
import type { ToolRegistry } from './toolTypes.js';

const DEFAULT_INITIAL_STEP_BUDGET = 8;
const DEFAULT_HARD_MAX_STEPS = 15;
const STEP_BUDGET_RENEWAL_GRANTS = [4, 2, 1] as const;
const NO_PROGRESS_WINDOW_SIZE = 3;
const DEFAULT_MAX_COMMAND_OUTPUT_CHARS = 4000;
const MAX_AUTO_MEMORY_OBSERVATIONS = 4;
const MAX_MEMORY_PROMPT_CHARS = 6000;
const NO_MEMORY_UPDATE_TOKEN = 'NO_MEMORY_UPDATE';

type AgentRuntimeDependencies = {
  toolRegistry: ToolRegistry;
  toolExecutor: ToolExecutor;
  fileMemory: FileMemoryStore;
  getNodeById: (id: string) => StoredNodeDetail | null;
  sessions: {
    getSession(sessionId: string): {
      sessionId: string;
      nodeId: string | null;
      host: string;
      port: number;
      username: string;
      status: 'connecting' | 'connected' | 'closed' | 'error';
    } | null;
  };
  streamAgentContext?: typeof streamAgentContext;
  completeAgentContext?: typeof completeAgentContext;
};

type StableObservation = {
  command: string;
  exitCode: number;
  output: string;
  durationMs: number;
};

type StepBudgetProgress = {
  madeProgress: boolean;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') {
      return JSON.stringify(value.slice(0, 300));
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

function buildToolCallSignature(toolCall: ToolCall) {
  return `${toolCall.name}:${stableStringify(toolCall.arguments)}`;
}

function buildToolResultSignature(envelope: ToolExecutionEnvelope) {
  if (!envelope.ok) {
    return null;
  }

  return `${envelope.toolName}:${stableStringify(envelope.data ?? null)}`;
}

function buildStepBudgetRenewalGrants(hardMaxSteps: number) {
  const grants: number[] = [];
  let remaining = Math.max(0, hardMaxSteps - DEFAULT_INITIAL_STEP_BUDGET);

  for (const grant of STEP_BUDGET_RENEWAL_GRANTS) {
    if (remaining <= 0) {
      break;
    }

    const nextGrant = Math.min(grant, remaining);
    grants.push(nextGrant);
    remaining -= nextGrant;
  }

  while (remaining > 0) {
    const nextGrant = 1;
    grants.push(nextGrant);
    remaining -= nextGrant;
  }

  while (remaining > 0) {
    grants.push(1);
    remaining -= 1;
  }

  return grants;
}

function hasRecentProgress(stepProgressHistory: StepBudgetProgress[]) {
  return stepProgressHistory.slice(-NO_PROGRESS_WINDOW_SIZE).some(entry => entry.madeProgress);
}

function extractStableObservation(envelope: ToolExecutionEnvelope): StableObservation | null {
  if (envelope.toolName !== 'session.run_command' || !envelope.ok || !envelope.data || typeof envelope.data !== 'object') {
    return null;
  }

  const payload = envelope.data as {
    command?: unknown;
    exitCode?: unknown;
    output?: unknown;
    durationMs?: unknown;
  };

  if (
    typeof payload.command !== 'string' ||
    typeof payload.exitCode !== 'number' ||
    typeof payload.output !== 'string'
  ) {
    return null;
  }

  const normalizedOutput = payload.output.trim();
  if (!normalizedOutput) {
    return null;
  }

  return {
    command: payload.command,
    exitCode: payload.exitCode,
    output: normalizedOutput.slice(0, 3000),
    durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : 0,
  };
}

function formatAutoMemoryEntry(task: string, finalAnswer: string, observations: StableObservation[]) {
  const timestamp = new Date().toISOString();

  return [
    `### ${timestamp} · ${task}`,
    '',
    '- 来源：Agent 自动沉淀',
    '',
    '#### 关键观察',
    ...observations.slice(-MAX_AUTO_MEMORY_OBSERVATIONS).flatMap((observation, index) => [
      `${index + 1}. 命令：\`${observation.command}\``,
      `   - 退出码：\`${observation.exitCode}\``,
      `   - 耗时：\`${observation.durationMs}ms\``,
      '',
      '   ```text',
      ...observation.output.split('\n').map(line => `   ${line}`),
      '   ```',
      '',
    ]),
    '#### 最终结论',
    finalAnswer.trim() || '任务已完成。',
    '',
  ].join('\n');
}

function trimForPrompt(text: string, maxLength = MAX_MEMORY_PROMPT_CHARS) {
  const normalized = text.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}\n...[已截断]`;
}

function buildMemoryObservationDigest(observations: StableObservation[]) {
  return observations
    .slice(-MAX_AUTO_MEMORY_OBSERVATIONS)
    .map((observation, index) =>
      [
        `${index + 1}. 命令：${observation.command}`,
        `退出码：${observation.exitCode}`,
        `耗时：${observation.durationMs}ms`,
        '输出：',
        observation.output,
      ].join('\n')
    )
    .join('\n\n');
}

function extractAssistantText(message: AssistantMessage) {
  return message.content
    .filter((block): block is Extract<AssistantMessage['content'][number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractToolCalls(message: AssistantMessage) {
  return message.content.filter(
    (block): block is ToolCall => block.type === 'toolCall'
  );
}

function buildToolResultMessage(
  envelope: ToolExecutionEnvelope,
  toolCallId: string,
  toolName: string
): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId,
    toolName,
    content: [
      {
        type: 'text',
        text: JSON.stringify(envelope),
      },
    ],
    isError: !envelope.ok,
    timestamp: Date.now(),
  };
}

async function consumeAssistantMessageStream(options: {
  stream: ReturnType<typeof streamAgentContext>;
  emit: (event: AgentStreamEvent) => void;
  runId: string;
  step: number;
}) {
  for await (const event of options.stream) {
    if (event.type === 'text_delta' && event.delta) {
      options.emit({
        type: 'assistant_message_delta',
        runId: options.runId,
        delta: event.delta,
        step: options.step,
        timestamp: Date.now(),
      });
      continue;
    }

    if (event.type === 'done') {
      return event.message;
    }

    if (event.type === 'error') {
      return event.error;
    }
  }

  throw new Error('模型流未返回完成事件。');
}

async function summarizeStableObservationsForMemory(options: {
  provider: Parameters<typeof completeAgentContext>[0];
  model: string;
  task: string;
  finalAnswer: string;
  existingNodeMemory: string;
  observations: StableObservation[];
  completeAgentContextFn: typeof completeAgentContext;
  signal: AbortSignal;
}) {
  const response = await options.completeAgentContextFn(
    options.provider,
    options.model,
    {
      systemPrompt: [
        '你正在维护 OpsClaw 的节点 MEMORY.md 文档。',
        '你的输出会被直接追加到 `## 自动沉淀` 小节。',
        '只保留稳定、长期可复用的事实、容量信息、结构性约定、重复出现的诊断结论。',
        '不要写入时间敏感的瞬时状态、逐步思考过程、无长期价值的一次性结果。',
        `如果这次任务没有值得沉淀的长期知识，只输出 ${NO_MEMORY_UPDATE_TOKEN}。`,
        '如果需要沉淀，请直接输出 Markdown：使用一个三级标题，下面跟 2 到 5 条简洁要点。',
        '不要输出额外说明，不要用代码围栏包裹整段内容。',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `任务：${options.task}`,
                '',
                '最终回答：',
                trimForPrompt(options.finalAnswer, 2000) || '[空]',
                '',
                '已有节点记忆摘录：',
                trimForPrompt(options.existingNodeMemory || '[当前为空]'),
                '',
                '本次稳定观察：',
                buildMemoryObservationDigest(options.observations),
                '',
                `请输出可直接写入 MEMORY.md 的 Markdown；若没有长期价值，输出 ${NO_MEMORY_UPDATE_TOKEN}。`,
              ].join('\n'),
            },
          ],
          timestamp: Date.now(),
        },
      ],
      tools: [],
    },
    options.signal
  );

  if (response.stopReason !== 'stop') {
    throw new Error(`记忆摘要 stopReason 异常：${response.stopReason}`);
  }

  const summary = extractAssistantText(response).trim();
  if (!summary || summary === NO_MEMORY_UPDATE_TOKEN) {
    return null;
  }

  return summary;
}

export class OpsAgentRuntime {
  constructor(private readonly dependencies: AgentRuntimeDependencies) {}

  async run(
    input: CreateAgentRunInput,
    emit: (event: AgentStreamEvent) => void,
    signal: AbortSignal
  ) {
    const runId = randomUUID();
    const hardMaxSteps = Math.max(1, input.maxSteps ?? DEFAULT_HARD_MAX_STEPS);
    let currentStepBudget = Math.min(DEFAULT_INITIAL_STEP_BUDGET, hardMaxSteps);
    const stepBudgetRenewalGrants = buildStepBudgetRenewalGrants(hardMaxSteps);
    let stepBudgetRenewalIndex = 0;
    const maxCommandOutputChars =
      input.maxCommandOutputChars ?? DEFAULT_MAX_COMMAND_OUTPUT_CHARS;
    const completeContext = this.dependencies.completeAgentContext ?? completeAgentContext;
    const stepStreamContext =
      this.dependencies.streamAgentContext ?? (this.dependencies.completeAgentContext ? null : streamAgentContext);
    const session = this.dependencies.sessions.getSession(input.sessionId);
    const globalMemory = await this.dependencies.fileMemory.readGlobalMemory();
    const stableObservations: StableObservation[] = [];
    const seenToolCallSignatures = new Set<string>();
    const seenSuccessfulResultSignatures = new Set<string>();
    const stepProgressHistory: StepBudgetProgress[] = [];

    if (!session) {
      logAgent('run_failed_missing_session', {
        runId,
        sessionId: input.sessionId,
      });
      emit({
        type: 'run_failed',
        runId,
        error: '目标会话不存在或尚未建立连接。',
        timestamp: Date.now(),
      });
      return;
    }

    const context: Context = {
      systemPrompt: buildAgentSystemPrompt({
        sessionId: input.sessionId,
        initialStepBudget: currentStepBudget,
        hardMaxSteps,
      }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `用户任务：${input.task.trim()}`,
                '',
                '当前会话：',
                `- sessionId: ${session.sessionId}`,
                `- host: ${session.host}`,
                `- port: ${session.port}`,
                `- username: ${session.username}`,
                `- status: ${session.status}`,
                '',
                '全局记忆（MEMORY.md）：',
                globalMemory.content.trim() || '[当前为空]',
              ].join('\n'),
            },
          ],
          timestamp: Date.now(),
        },
      ],
      tools: await this.dependencies.toolRegistry.listPiTools({
        sessionId: input.sessionId,
      }),
    };

    emit({
      type: 'run_started',
      runId,
      sessionId: input.sessionId,
      task: input.task.trim(),
      timestamp: Date.now(),
    });
    logAgent('run_started', {
      runId,
      sessionId: input.sessionId,
      model: input.model,
      providerId: input.providerId,
      task: input.task.trim(),
      hasGlobalMemory: globalMemory.exists,
    });

    for (let step = 1; step <= currentStepBudget; step += 1) {
      if (signal.aborted) {
        logAgent('run_cancelled_before_step', { runId, step });
        emit({
          type: 'run_cancelled',
          runId,
          step,
          timestamp: Date.now(),
        });
        return;
      }

      logAgent('step_model_request_started', { runId, step });
      const assistantMessage = stepStreamContext
        ? await consumeAssistantMessageStream({
            stream: stepStreamContext(input.provider, input.model, context, signal),
            emit,
            runId,
            step,
          })
        : await completeContext(
            input.provider,
            input.model,
            context,
            signal
          );

      context.messages.push(assistantMessage);
      logAgent('step_model_request_finished', {
        runId,
        step,
        stopReason: assistantMessage.stopReason,
        contentBlocks: assistantMessage.content.length,
      });

      const assistantText = extractAssistantText(assistantMessage);
      if (assistantText) {
        emit({
          type: 'assistant_message',
          runId,
          text: assistantText,
          step,
          timestamp: Date.now(),
        });
      }

      if (assistantMessage.stopReason === 'stop') {
        if (session.nodeId && stableObservations.length > 0) {
          const node = this.dependencies.getNodeById(session.nodeId);
          if (node) {
            try {
              let memoryEntry: string | null = null;
              const existingNodeMemory = await this.dependencies.fileMemory.readNodeMemory(
                node.id,
                node.name
              );

              logAgent('auto_node_memory_summarization_started', {
                runId,
                sessionId: input.sessionId,
                nodeId: node.id,
                observations: stableObservations.length,
              });

              try {
                memoryEntry = await summarizeStableObservationsForMemory({
                  provider: input.provider,
                  model: input.model,
                  task: input.task.trim(),
                  finalAnswer: assistantText || '任务已完成。',
                  existingNodeMemory: existingNodeMemory.content,
                  observations: stableObservations,
                  completeAgentContextFn: completeContext,
                  signal,
                });
                logAgent('auto_node_memory_summarization_finished', {
                  runId,
                  sessionId: input.sessionId,
                  nodeId: node.id,
                  generated: Boolean(memoryEntry),
                });
              } catch (error) {
                logAgent('auto_node_memory_summarization_failed', {
                  runId,
                  sessionId: input.sessionId,
                  nodeId: node.id,
                  error: error instanceof Error ? error.message : '节点记忆自动摘要失败。',
                });
              }

              if (!memoryEntry) {
                memoryEntry = formatAutoMemoryEntry(
                  input.task.trim(),
                  assistantText || '任务已完成。',
                  stableObservations
                );
              }

              await this.dependencies.fileMemory.appendAutoNodeMemoryEntry(
                node.id,
                node.name,
                memoryEntry
              );
              logAgent('auto_node_memory_persisted', {
                runId,
                sessionId: input.sessionId,
                nodeId: node.id,
                observations: stableObservations.length,
              });
            } catch (error) {
              logAgent('auto_node_memory_persist_failed', {
                runId,
                sessionId: input.sessionId,
                nodeId: node.id,
                error: error instanceof Error ? error.message : '节点记忆自动沉淀失败。',
              });
            }
          }
        }

        logAgent('run_completed', { runId, step });
        emit({
          type: 'run_completed',
          runId,
          finalAnswer: assistantText || '任务已完成。',
          steps: step,
          timestamp: Date.now(),
        });
        return;
      }

      if (assistantMessage.stopReason === 'error') {
        const errorMessage = assistantMessage.errorMessage?.trim() || '模型请求失败。';
        logAgent('run_failed_model_error', {
          runId,
          step,
          error: errorMessage,
        });
        emit({
          type: 'run_failed',
          runId,
          error: errorMessage,
          step,
          timestamp: Date.now(),
        });
        return;
      }

      if (assistantMessage.stopReason === 'aborted') {
        logAgent('run_cancelled_model_request', { runId, step });
        emit({
          type: 'run_cancelled',
          runId,
          step,
          timestamp: Date.now(),
        });
        return;
      }

      if (assistantMessage.stopReason === 'length') {
        logAgent('run_failed_length', { runId, step });
        emit({
          type: 'run_failed',
          runId,
          error: '模型输出达到长度上限，Agent 已停止。',
          step,
          timestamp: Date.now(),
        });
        return;
      }

      if (assistantMessage.stopReason !== 'toolUse') {
        logAgent('run_failed_unhandled_stop_reason', {
          runId,
          step,
          stopReason: assistantMessage.stopReason,
        });
        emit({
          type: 'run_failed',
          runId,
          error: '模型返回了未处理的 stopReason。',
          step,
          timestamp: Date.now(),
        });
        return;
      }

      const availableTools = await this.dependencies.toolRegistry.listPiTools({
        sessionId: input.sessionId,
      });
      const toolCalls = extractToolCalls(assistantMessage);
      let stepMadeProgress = false;
      let stepHadSuccessfulToolExecution = false;
      logAgent('step_tool_calls_detected', {
        runId,
        step,
        toolCalls: toolCalls.map(call => call.name),
      });

      if (toolCalls.length === 0) {
        logAgent('run_failed_tool_use_without_tools', { runId, step });
        emit({
          type: 'run_failed',
          runId,
          error: '模型请求了工具调用，但未返回任何工具。',
          step,
          timestamp: Date.now(),
        });
        return;
      }

      const stepHasNewToolCallSignature = toolCalls.some((toolCall) => {
        const signature = buildToolCallSignature(toolCall);
        const isNew = !seenToolCallSignatures.has(signature);
        seenToolCallSignatures.add(signature);
        return isNew;
      });

      for (const toolCall of toolCalls) {
        if (signal.aborted) {
          logAgent('run_cancelled_during_tool_loop', {
            runId,
            step,
            toolName: toolCall.name,
          });
          emit({
            type: 'run_cancelled',
            runId,
            step,
            timestamp: Date.now(),
          });
          return;
        }

        emit({
          type: 'tool_call',
          runId,
          step,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          timestamp: Date.now(),
        });
        logAgent('tool_call_received', {
          runId,
          step,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        });

        let validatedArgs: unknown;

        try {
          validatedArgs = validateToolCall(availableTools, toolCall);
          logAgent('tool_call_validated', {
            runId,
            step,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          });
        } catch (error) {
          logAgent('tool_call_validation_failed', {
            runId,
            step,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            error: error instanceof Error ? error.message : '工具参数校验失败。',
          });
          const envelope: ToolExecutionEnvelope = {
            toolName: toolCall.name,
            toolCallId: toolCall.id,
            ok: false,
            error: {
              code: 'tool_validation_failed',
              message: error instanceof Error ? error.message : '工具参数校验失败。',
              retryable: true,
            },
            meta: {
              startedAt: Date.now(),
              completedAt: Date.now(),
              durationMs: 0,
            },
          };

          context.messages.push(buildToolResultMessage(envelope, toolCall.id, toolCall.name));

          emit({
            type: 'tool_execution_finished',
            runId,
            step,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            result: envelope,
            timestamp: Date.now(),
          });
          continue;
        }

        const envelope = await this.dependencies.toolExecutor.executeToolCall(toolCall, validatedArgs, {
          runId,
          userTask: input.task.trim(),
          sessionId: input.sessionId,
          step,
          approvalMode: input.approvalMode ?? 'auto-readonly',
          maxCommandOutputChars,
          signal,
          capabilities: {
            sessions: this.dependencies.sessions as never,
            fileMemory: this.dependencies.fileMemory,
          },
          emit,
        });
        logAgent('tool_execution_finished', {
          runId,
          step,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          ok: envelope.ok,
          durationMs: envelope.meta.durationMs,
          error: envelope.error?.message,
        });

        const stableObservation = extractStableObservation(envelope);
        if (stableObservation) {
          stableObservations.push(stableObservation);
        }

        const resultSignature = buildToolResultSignature(envelope);
        if (resultSignature) {
          stepHadSuccessfulToolExecution = true;
          if (!seenSuccessfulResultSignatures.has(resultSignature)) {
            seenSuccessfulResultSignatures.add(resultSignature);
            stepMadeProgress = true;
          }
        }

        context.messages.push(buildToolResultMessage(envelope, toolCall.id, toolCall.name));

        emit({
          type: 'tool_execution_finished',
          runId,
          step,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: envelope,
          timestamp: Date.now(),
        });
      }

      if (!stepMadeProgress && stepHasNewToolCallSignature && stepHadSuccessfulToolExecution) {
        stepMadeProgress = true;
      }

      stepProgressHistory.push({ madeProgress: stepMadeProgress });

      if (step === currentStepBudget) {
        const grant = stepBudgetRenewalGrants[stepBudgetRenewalIndex];

        if (grant !== undefined && hasRecentProgress(stepProgressHistory)) {
          currentStepBudget = Math.min(currentStepBudget + grant, hardMaxSteps);
          stepBudgetRenewalIndex += 1;
          logAgent('run_budget_extended', {
            runId,
            step,
            grant,
            nextBudget: currentStepBudget,
            hardMaxSteps,
          });
          emit({
            type: 'warning',
            runId,
            message: `已达到当前步数预算 ${step}，检测到仍有进展，自动续期 +${grant} 步（当前上限 ${currentStepBudget} / ${hardMaxSteps}）。`,
            step,
            timestamp: Date.now(),
          });
          continue;
        }

        const madeRecentProgress = hasRecentProgress(stepProgressHistory);
        const warningMessage = madeRecentProgress
          ? `已达到总执行上限 ${currentStepBudget}，Agent 停止继续尝试。`
          : `已达到当前步数预算 ${step}，最近几步没有有效进展，Agent 停止继续尝试。`;
        const errorMessage = madeRecentProgress
          ? '已达到总执行上限，请缩小任务范围或提供更具体的目标。'
          : '已达到当前步数预算且最近几步没有有效进展，请缩小任务范围或提供更具体的目标。';

        logAgent('run_failed_step_budget_exhausted', {
          runId,
          step,
          currentStepBudget,
          hardMaxSteps,
          reason: madeRecentProgress ? 'hard_cap' : 'no_progress',
        });
        emit({
          type: 'warning',
          runId,
          message: warningMessage,
          step,
          timestamp: Date.now(),
        });
        emit({
          type: 'run_failed',
          runId,
          error: errorMessage,
          step,
          timestamp: Date.now(),
        });
        return;
      }
    }
  }
}
