import { randomUUID } from 'node:crypto';

import {
  type Context,
} from '@mariozechner/pi-ai';

import { completeAgentContext, streamAgentContext } from '../llmClient.js';
import type { CreateAgentRunInput, AgentStreamEvent, ToolExecutionEnvelope } from './agentTypes.js';
import {
  createAgentLoopState,
  extractAssistantText,
  type AgentLoopOutcome,
  type AgentLoopState,
  type StableObservation,
  resumeAgentLoop,
  runAgentLoop,
} from './agentLoop.js';
import { createAgentRunRegistry } from './agentRunRegistry.js';
import type { FileMemoryStore } from './fileMemoryStore.js';
import { createInteractionRequest } from './interactionFactory.js';
import type { InteractionRequest } from './interactionTypes.js';
import { logAgent } from './logger.js';
import type { StoredNodeDetail } from '../nodeStore.js';
import { loadBundledOpsClawRules, resolveEffectiveOpsClawRules } from './opsclawRules.js';
import { buildAgentSystemPrompt } from './agentPrompt.js';
import type { SessionSystemInfo } from './sessionRegistry.js';
import { ToolExecutor } from './toolExecutor.js';
import type { ToolPauseOutcome, ToolRegistry } from './toolTypes.js';
import { buildSessionSystemInfoSummaryLines } from '../sessionSystemInfoProbe.js';

const DEFAULT_INITIAL_STEP_BUDGET = 12;
const DEFAULT_HARD_MAX_STEPS = 24;
const DEFAULT_MAX_COMMAND_OUTPUT_CHARS = 4000;
const MAX_AUTO_MEMORY_OBSERVATIONS = 4;
const MAX_MEMORY_PROMPT_CHARS = 6000;
const NO_MEMORY_UPDATE_TOKEN = 'NO_MEMORY_UPDATE';

type AgentRuntimeDependencies = {
  toolRegistry: ToolRegistry;
  toolExecutor: ToolExecutor;
  fileMemory: FileMemoryStore;
  getNodeById: (id: string) => StoredNodeDetail | null;
  agentRunRegistry?: ReturnType<typeof createAgentRunRegistry>;
  sessions: {
    getSession(sessionId: string): {
      sessionId: string;
      nodeId: string | null;
      host: string;
      port: number;
      username: string;
      status: 'connecting' | 'connected' | 'closed' | 'error';
      systemInfo?: SessionSystemInfo | null;
    } | null;
    getPendingExecutionDebug?: (
      sessionId: string
    ) => { state: string; command: string; startMarker: string } | null;
    resumePendingExecutionWait?: (sessionId: string, timeoutMs: number) => void;
    cancelPendingExecutionWait?: (sessionId: string) => void;
  };
  streamAgentContext?: typeof streamAgentContext;
  completeAgentContext?: typeof completeAgentContext;
};

type PendingRunAction = {
  selectedAction: 'approve' | 'reject' | 'submit' | 'continue_waiting' | 'acknowledge' | 'cancel';
  payload: Record<string, unknown>;
};

type PausedRunHandle = {
  pause: ToolPauseOutcome;
  pendingAction: PendingRunAction | null;
  continueRun: (options: {
    emit: (event: AgentStreamEvent) => void;
    signal: AbortSignal;
    action: PendingRunAction;
  }) => Promise<void>;
};

type PauseResolution =
  | { kind: 'paused'; pause: ToolPauseOutcome }
  | { kind: 'failed' }
  | { kind: 'completed'; envelope: ToolExecutionEnvelope };

function isPauseOutcome(
  value: ToolExecutionEnvelope | ToolPauseOutcome
): value is ToolPauseOutcome {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'pause';
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
  private readonly agentRunRegistry: ReturnType<typeof createAgentRunRegistry>;
  private readonly pausedRuns = new Map<string, PausedRunHandle>();

  constructor(private readonly dependencies: AgentRuntimeDependencies) {
    this.agentRunRegistry = dependencies.agentRunRegistry ?? createAgentRunRegistry();
  }

  private emitRunStateChanged(runId: string, emit: (event: AgentStreamEvent) => void) {
    const snapshot = this.agentRunRegistry.getRun(runId);
    if (!snapshot) {
      return;
    }

    emit({
      type: 'run_state_changed',
      runId,
      state: snapshot.state,
      executionState: snapshot.executionState,
      blockingMode: snapshot.blockingMode,
      timestamp: Date.now(),
    });
  }

  getRunSnapshot(runId: string) {
    return this.agentRunRegistry.getRun(runId);
  }

  getSessionReattachableRun(sessionId: string) {
    return this.agentRunRegistry.getReattachableRun(sessionId);
  }

  submitInteraction(
    runId: string,
    requestId: string,
    submission: { selectedAction: PendingRunAction['selectedAction']; payload: Record<string, unknown> }
  ) {
    const snapshot = this.agentRunRegistry.getRun(runId);
    if (!snapshot?.activeInteraction || snapshot.activeInteraction.id !== requestId) {
      throw new Error('指定 interaction 不存在。');
    }
    if (
      !snapshot.activeInteraction.actions.some(
        (action) => action.kind === submission.selectedAction
      )
    ) {
      throw new Error('当前 interaction 不支持该提交动作。');
    }

    const pausedRun = this.pausedRuns.get(runId);
    if (!pausedRun) {
      throw new Error('当前 run 没有可恢复的执行上下文。');
    }

    if (submission.selectedAction === 'continue_waiting') {
      if (snapshot.activeInteraction.interactionKind !== 'terminal_wait') {
        throw new Error('只有 terminal_wait interaction 支持继续等待。');
      }
      if (snapshot.activeInteraction.status !== 'expired') {
        throw new Error('只有 suspended 的 terminal_wait interaction 才能继续等待。');
      }

      const timeoutMs =
        typeof snapshot.activeInteraction.metadata.timeoutMs === 'number'
          ? snapshot.activeInteraction.metadata.timeoutMs
          : 0;
      const settledEnvelope = pausedRun.pause.continuation.getSettledEnvelope?.() ?? null;
      const pendingExecution = this.dependencies.sessions.getPendingExecutionDebug?.(snapshot.sessionId);
      if (!settledEnvelope && pendingExecution !== null) {
        if (!this.dependencies.sessions.resumePendingExecutionWait) {
          throw new Error('当前运行环境不支持恢复等待中的命令。');
        }

        this.dependencies.sessions.resumePendingExecutionWait(snapshot.sessionId, timeoutMs);
      }

      this.agentRunRegistry.markInteractionReopened({
        runId,
        interactionId: requestId,
        deadlineAt: Date.now() + timeoutMs,
      });
      pausedRun.pendingAction = {
        selectedAction: 'continue_waiting',
        payload: {},
      };
      return this.agentRunRegistry.getRun(runId);
    }

    if (submission.selectedAction === 'reject' || submission.selectedAction === 'cancel') {
      this.agentRunRegistry.rejectInteraction({ runId, interactionId: requestId });
      pausedRun.pendingAction = submission;
      return this.agentRunRegistry.getRun(runId);
    }

    if (
      submission.selectedAction === 'approve' ||
      submission.selectedAction === 'submit' ||
      submission.selectedAction === 'acknowledge'
    ) {
      this.agentRunRegistry.resolveInteraction({ runId, interactionId: requestId });
      pausedRun.pendingAction = submission;
      return this.agentRunRegistry.getRun(runId);
    }

    throw new Error('不支持的 interaction 提交动作。');
  }

  async streamContinuation(
    runId: string,
    emit: (event: AgentStreamEvent) => void,
    signal: AbortSignal
  ) {
    const pausedRun = this.pausedRuns.get(runId);
    if (!pausedRun) {
      throw new Error('指定 run 当前没有待恢复的执行上下文。');
    }
    if (!pausedRun.pendingAction) {
      throw new Error('指定 run 当前没有可以继续执行的 gate 动作。');
    }

    const action = pausedRun.pendingAction;
    pausedRun.pendingAction = null;
    try {
      await pausedRun.continueRun({
        emit,
        signal,
        action,
      });
    } catch (error) {
      if (this.pausedRuns.get(runId) === pausedRun && pausedRun.pendingAction === null) {
        pausedRun.pendingAction = action;
      }
      throw error;
    }
  }

  async run(
    input: CreateAgentRunInput,
    emit: (event: AgentStreamEvent) => void,
    signal: AbortSignal
  ) {
    const runId = randomUUID();
    const hardMaxSteps = Math.max(1, input.maxSteps ?? DEFAULT_HARD_MAX_STEPS);
    const initialStepBudget = Math.min(DEFAULT_INITIAL_STEP_BUDGET, hardMaxSteps);
    const maxCommandOutputChars =
      input.maxCommandOutputChars ?? DEFAULT_MAX_COMMAND_OUTPUT_CHARS;
    const completeContext = this.dependencies.completeAgentContext ?? completeAgentContext;
    const stepStreamContext =
      this.dependencies.streamAgentContext ?? (this.dependencies.completeAgentContext ? null : streamAgentContext);
    const session = this.dependencies.sessions.getSession(input.sessionId);
    const globalMemory = await this.dependencies.fileMemory.readGlobalMemory();
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
    const node = session.nodeId ? this.dependencies.getNodeById(session.nodeId) : null;
    const sessionSystemInfo = session.systemInfo ?? null;
    const effectiveRules = resolveEffectiveOpsClawRules(
      await loadBundledOpsClawRules(import.meta.url),
      node?.groupName ?? null
    );
    const sessionGroupName = node?.groupName ?? null;

    const context: Context = {
      systemPrompt: buildAgentSystemPrompt({
        sessionId: input.sessionId,
        initialStepBudget,
        hardMaxSteps,
        sessionSystemInfo,
      }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                ...(input.conversationHistory && input.conversationHistory.length > 0
                  ? [
                      '本次会话历史对话：',
                      ...input.conversationHistory.map(
                        (turn) => `[${turn.role === 'user' ? '用户' : '助手'}]: ${turn.text}`
                      ),
                      '',
                    ]
                  : []),
                `用户任务：${input.task.trim()}`,
                '',
                '当前会话：',
                `- sessionId: ${session.sessionId}`,
                `- host: ${session.host}`,
                `- port: ${session.port}`,
                `- username: ${session.username}`,
                `- status: ${session.status}`,
                sessionSystemInfo
                  ? ['', '当前会话系统信息：', ...buildSessionSystemInfoSummaryLines(sessionSystemInfo)]
                  : [],
                '',
                '全局记忆（MEMORY.md）：',
                globalMemory.content.trim() || '[当前为空]',
              ]
                .flat()
                .join('\n'),
            },
          ],
          timestamp: Date.now(),
        },
      ],
      tools: await this.dependencies.toolRegistry.listPiTools({
        sessionId: input.sessionId,
      }),
    };
    const sessionLabel = `${session.username}@${session.host}:${session.port}`;

    emit({
      type: 'run_started',
      runId,
      sessionId: input.sessionId,
      task: input.task.trim(),
      timestamp: Date.now(),
    });
    this.agentRunRegistry.registerRun({
      runId,
      sessionId: input.sessionId,
      task: input.task.trim(),
    });
    this.emitRunStateChanged(runId, emit);
    logAgent('run_started', {
      runId,
      sessionId: input.sessionId,
      model: input.model,
      providerId: input.providerId,
      task: input.task.trim(),
      hasGlobalMemory: globalMemory.exists,
    });
    const loopState = createAgentLoopState({
      provider: input.provider,
      model: input.model,
      runId,
      task: input.task.trim(),
      sessionId: input.sessionId,
      sessionLabel,
      sessionGroupName,
      approvalMode: input.approvalMode ?? 'auto-readonly',
      maxCommandOutputChars,
      effectiveRules,
      hardMaxSteps,
      initialStepBudget,
      context,
      toolRegistry: this.dependencies.toolRegistry,
      toolExecutor: this.dependencies.toolExecutor,
      sessions: this.dependencies.sessions as never,
      fileMemory: this.dependencies.fileMemory,
      completeAgentContext: completeContext,
      streamAgentContext: stepStreamContext,
    });
    const processLoopOutcome = async (
      outcome: AgentLoopOutcome,
      currentLoopState: AgentLoopState,
      activeEmit: (event: AgentStreamEvent) => void,
      activeSignal: AbortSignal
    ): Promise<void> => {
      if (outcome.kind === 'completed') {
        if (session.nodeId && outcome.stableObservations.length > 0) {
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
                observations: outcome.stableObservations.length,
              });

              try {
                memoryEntry = await summarizeStableObservationsForMemory({
                  provider: input.provider,
                  model: input.model,
                  task: input.task.trim(),
                  finalAnswer: outcome.finalAnswer,
                  existingNodeMemory: existingNodeMemory.content,
                  observations: outcome.stableObservations,
                  completeAgentContextFn: completeContext,
                  signal: activeSignal,
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
                  outcome.finalAnswer,
                  outcome.stableObservations
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
                observations: outcome.stableObservations.length,
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

        this.agentRunRegistry.markRunCompleted(runId);
        this.pausedRuns.delete(runId);
        logAgent('run_completed', { runId, step: outcome.steps });
        activeEmit({
          type: 'run_completed',
          runId,
          finalAnswer: outcome.finalAnswer,
          steps: outcome.steps,
          timestamp: Date.now(),
        });
        return;
      }

      if (outcome.kind === 'failed') {
        this.agentRunRegistry.markRunFailed(runId);
        this.pausedRuns.delete(runId);
        logAgent('run_failed_loop', {
          runId,
          step: outcome.step,
          error: outcome.error,
        });
        activeEmit({
          type: 'run_failed',
          runId,
          error: outcome.error,
          step: outcome.step,
          timestamp: Date.now(),
        });
        return;
      }

      if (outcome.kind === 'cancelled') {
        this.agentRunRegistry.markRunCancelled(runId);
        this.pausedRuns.delete(runId);
        logAgent('run_cancelled_loop', { runId, step: outcome.step });
        activeEmit({
          type: 'run_cancelled',
          runId,
          step: outcome.step,
          timestamp: Date.now(),
        });
        return;
      }

      let activePause = outcome.pause;
      let continueRun: PausedRunHandle['continueRun'];
      continueRun = async ({ emit: resumedEmit, signal: resumedSignal, action }) => {
        const resumed = await this.resumePausedToolCall({
          runId,
          emit: resumedEmit,
          signal: resumedSignal,
          action,
          pause: activePause,
        });

        if (resumed.kind === 'paused') {
          activePause = resumed.pause;
          this.pausedRuns.set(runId, {
            pause: resumed.pause,
            pendingAction: null,
            continueRun,
          });
          return;
        }
        if (resumed.kind === 'failed') {
          return;
        }

        const nextResult = await resumeAgentLoop(
          currentLoopState,
          resumed.envelope,
          resumedSignal,
          resumedEmit
        );
        if (action.selectedAction !== 'continue_waiting') {
          this.agentRunRegistry.markRunRunning({
            runId,
            clearInteraction: true,
          });
        }
        await processLoopOutcome(nextResult.outcome, currentLoopState, resumedEmit, resumedSignal);
      };

      const pauseOutcome = await this.handlePauseOutcome({
        runId,
        sessionId: input.sessionId,
        emit: activeEmit,
        signal: activeSignal,
        pause: outcome.pause,
      });

      if (pauseOutcome.kind === 'paused') {
        activePause = pauseOutcome.pause;
        this.pausedRuns.set(runId, {
          pause: pauseOutcome.pause,
          pendingAction: null,
          continueRun,
        });
        return;
      }
      if (pauseOutcome.kind === 'failed') {
        return;
      }

      const nextResult = await resumeAgentLoop(
        currentLoopState,
        pauseOutcome.envelope,
        activeSignal,
        activeEmit
      );
      await processLoopOutcome(nextResult.outcome, currentLoopState, activeEmit, activeSignal);
    };

    const initialResult = await runAgentLoop(loopState, signal, emit);
    await processLoopOutcome(initialResult.outcome, loopState, emit, signal);
  }

  private async handlePauseOutcome(options: {
    runId: string;
    sessionId: string;
    emit: (event: AgentStreamEvent) => void;
    signal: AbortSignal;
    pause: ToolPauseOutcome;
  }): Promise<PauseResolution> {
    const request = createInteractionRequest({
      runId: options.runId,
      sessionId: options.sessionId,
      source: options.pause.interaction,
    });
    const openedRequest = this.agentRunRegistry.openInteraction({
      runId: options.runId,
      sessionId: options.sessionId,
      request,
    });

    options.emit({
      type: 'interaction_requested',
      runId: options.runId,
      request: openedRequest,
      timestamp: Date.now(),
    });
    this.emitRunStateChanged(options.runId, options.emit);

    if (options.pause.interaction.source !== 'terminal_wait') {
      return { kind: 'paused', pause: options.pause };
    }

    return this.waitForTerminalInputInteraction({
      runId: options.runId,
      sessionId: options.sessionId,
      request: openedRequest,
      emit: options.emit,
      pause: options.pause,
      waitForCompletion: () => options.pause.continuation.waitForCompletion?.() as Promise<ToolExecutionEnvelope>,
      command: options.pause.interaction.context.command,
    });
  }

  private async waitForTerminalInputInteraction(options: {
    runId: string;
    sessionId: string;
    request: InteractionRequest;
    emit: (event: AgentStreamEvent) => void;
    pause: ToolPauseOutcome;
    waitForCompletion: () => Promise<ToolExecutionEnvelope>;
    command: string;
  }): Promise<PauseResolution> {
    const completionPromise = options.waitForCompletion().then((envelope) => ({
      kind: 'completed' as const,
      envelope,
    }));

    while (true) {
      const result = await Promise.race([
        completionPromise,
        new Promise<{ kind: 'pending' }>((resolve) => {
          setTimeout(() => resolve({ kind: 'pending' }), 25);
        }),
      ]);

      if (result.kind === 'completed') {
        if (!result.envelope.ok) {
          const rejectedRequest = this.agentRunRegistry.rejectInteraction({
            runId: options.runId,
            interactionId: options.request.id,
          });
          options.emit({
            type: 'interaction_rejected',
            runId: options.runId,
            request: rejectedRequest,
            timestamp: Date.now(),
          });
          this.agentRunRegistry.markRunFailed(options.runId);
          options.emit({
            type: 'run_failed',
            runId: options.runId,
            error: result.envelope.error?.message ?? '交互式命令上下文已丢失。',
            timestamp: Date.now(),
          });
          return { kind: 'failed' };
        }

        options.emit({
          type: 'interaction_resolved',
          runId: options.runId,
          request: this.agentRunRegistry.resolveInteraction({
            runId: options.runId,
            interactionId: options.request.id,
          }),
          timestamp: Date.now(),
        });
        this.agentRunRegistry.markRunRunning({
          runId: options.runId,
          clearInteraction: true,
        });
        this.emitRunStateChanged(options.runId, options.emit);
        return result;
      }

      const pendingExecution = this.dependencies.sessions.getPendingExecutionDebug?.(options.sessionId);
      if (
        !pendingExecution ||
        pendingExecution.command !== options.command ||
        pendingExecution.state !== 'suspended_waiting_for_input'
      ) {
        continue;
      }

      this.agentRunRegistry.expireInteraction({
        runId: options.runId,
        interactionId: options.request.id,
      });
      const expiredRequest = this.agentRunRegistry.getRun(options.runId)?.activeInteraction;
      if (expiredRequest) {
        options.emit({
          type: 'interaction_expired',
          runId: options.runId,
          request: expiredRequest,
          timestamp: Date.now(),
        });
      }
      this.emitRunStateChanged(options.runId, options.emit);
      return { kind: 'paused', pause: options.pause };
    }
  }

  private async resumePausedToolCall(options: {
    runId: string;
    emit: (event: AgentStreamEvent) => void;
    signal: AbortSignal;
    action: PendingRunAction;
    pause: ToolPauseOutcome;
  }): Promise<PauseResolution> {
    const snapshot = this.agentRunRegistry.getRun(options.runId);
    if (!snapshot?.activeInteraction) {
      throw new Error('指定 run 当前没有待处理的 interaction。');
    }
    if (options.pause.interaction.source === 'terminal_wait') {
      if (
        options.action.selectedAction !== 'continue_waiting' &&
        options.action.selectedAction !== 'cancel'
      ) {
        throw new Error('terminal_wait interaction 仅支持继续等待或取消。');
      }
      if (options.action.selectedAction === 'cancel') {
        if (snapshot.activeInteraction.status !== 'rejected') {
          throw new Error('terminal_wait interaction 尚未被取消。');
        }
        if (!this.dependencies.sessions.cancelPendingExecutionWait) {
          throw new Error('当前运行环境不支持取消等待中的命令。');
        }

        this.dependencies.sessions.cancelPendingExecutionWait(snapshot.sessionId);
        void options.pause.continuation.waitForCompletion?.(options.signal).catch(() => undefined);

        options.emit({
          type: 'interaction_rejected',
          runId: options.runId,
          request: snapshot.activeInteraction,
          timestamp: Date.now(),
        });
        this.agentRunRegistry.markRunCancelled(options.runId);
        this.pausedRuns.delete(options.runId);
        options.emit({
          type: 'run_cancelled',
          runId: options.runId,
          timestamp: Date.now(),
        });
        return { kind: 'failed' };
      }

      if (snapshot.activeInteraction.status !== 'open') {
        throw new Error('terminal_wait interaction 当前不处于等待状态。');
      }

      return this.waitForTerminalInputInteraction({
        runId: options.runId,
        sessionId: snapshot.sessionId,
        request: snapshot.activeInteraction,
        emit: options.emit,
        pause: options.pause,
        waitForCompletion: () =>
          options.pause.continuation.waitForCompletion?.(options.signal) as Promise<ToolExecutionEnvelope>,
        command: options.pause.interaction.context.command,
      });
    }

    if (
      options.pause.interaction.source !== 'policy_approval' &&
      options.pause.interaction.source !== 'parameter_collection' &&
      options.pause.interaction.source !== 'user_interaction'
    ) {
      throw new Error('当前 interaction 不支持恢复执行。');
    }

    if (options.action.selectedAction === 'reject' || options.action.selectedAction === 'cancel') {
      if (snapshot.activeInteraction.status !== 'rejected') {
        throw new Error('interaction 尚未被拒绝。');
      }

      options.emit({
        type: 'interaction_rejected',
        runId: options.runId,
        request: snapshot.activeInteraction,
        timestamp: Date.now(),
      });
      this.agentRunRegistry.markRunRunning({
        runId: options.runId,
      });
      this.emitRunStateChanged(options.runId, options.emit);
      return {
        kind: 'completed',
        envelope: options.pause.continuation.reject?.() as ToolExecutionEnvelope,
      };
    }

    if (snapshot.activeInteraction.status !== 'resolved') {
      throw new Error('interaction 尚未被确认。');
    }

    options.emit({
      type: 'interaction_resolved',
      runId: options.runId,
      request: snapshot.activeInteraction,
      timestamp: Date.now(),
    });
    this.agentRunRegistry.markRunRunning({
      runId: options.runId,
    });
    this.emitRunStateChanged(options.runId, options.emit);

    const resumed =
      options.pause.interaction.source === 'parameter_collection' &&
      options.action.selectedAction === 'submit'
        ? await options.pause.continuation.resume?.(
            (options.action.payload.fields ?? {}) as Record<string, string>,
            options.signal
          )
        : options.pause.interaction.source === 'user_interaction'
          ? await options.pause.continuation.resume?.(
              {
                selectedAction: options.action.selectedAction,
                payload: options.action.payload,
              },
              options.signal
            )
          : await options.pause.continuation.resume?.(options.signal);
    if (isPauseOutcome(resumed as ToolExecutionEnvelope | ToolPauseOutcome)) {
      return this.handlePauseOutcome({
        runId: options.runId,
        sessionId: snapshot.sessionId,
        emit: options.emit,
        signal: options.signal,
        pause: resumed as ToolPauseOutcome,
      });
    }

    return {
      kind: 'completed',
      envelope: resumed as ToolExecutionEnvelope,
    };
  }
}
