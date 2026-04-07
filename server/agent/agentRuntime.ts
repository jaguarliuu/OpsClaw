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
import type { HumanGateRecord } from './humanGateTypes.js';
import { logAgent } from './logger.js';
import type { StoredNodeDetail } from '../nodeStore.js';
import { buildAgentSystemPrompt } from './agentPrompt.js';
import { ToolExecutor } from './toolExecutor.js';
import type { ToolPauseOutcome, ToolRegistry } from './toolTypes.js';

const DEFAULT_INITIAL_STEP_BUDGET = 8;
const DEFAULT_HARD_MAX_STEPS = 15;
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
    } | null;
    getPendingExecutionDebug?: (
      sessionId: string
    ) => { state: string; command: string; startMarker: string } | null;
    resumePendingExecutionWait?: (sessionId: string, timeoutMs: number) => void;
  };
  streamAgentContext?: typeof streamAgentContext;
  completeAgentContext?: typeof completeAgentContext;
};

type PendingRunAction =
  | { kind: 'resume_waiting' }
  | { kind: 'resolve_approval' }
  | { kind: 'reject_approval' };

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
  | { kind: 'paused' }
  | { kind: 'failed' }
  | { kind: 'completed'; envelope: ToolExecutionEnvelope };

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

  getRunSnapshot(runId: string) {
    return this.agentRunRegistry.getRun(runId);
  }

  getSessionReattachableRun(sessionId: string) {
    return this.agentRunRegistry.getReattachableRun(sessionId);
  }

  resumeWaiting(runId: string, gateId: string) {
    const snapshot = this.agentRunRegistry.getRun(runId);
    if (!snapshot?.openGate || snapshot.openGate.id !== gateId) {
      throw new Error('指定的 human gate 不存在。');
    }
    if (snapshot.openGate.kind !== 'terminal_input') {
      throw new Error('只有 terminal_input gate 支持继续等待。');
    }
    if (snapshot.openGate.status !== 'expired') {
      throw new Error('只有 suspended 的 terminal_input gate 才能继续等待。');
    }
    const pausedRun = this.pausedRuns.get(runId);
    if (!pausedRun) {
      throw new Error('当前 run 没有可恢复的执行上下文。');
    }
    if (pausedRun.pause.gateKind !== 'terminal_input') {
      throw new Error('当前 run 没有 terminal_input 恢复上下文。');
    }

    const settledEnvelope = pausedRun.pause.continuation.getSettledEnvelope();
    const pendingExecution = this.dependencies.sessions.getPendingExecutionDebug?.(snapshot.sessionId);
    if (!settledEnvelope && pendingExecution !== null) {
      if (!this.dependencies.sessions.resumePendingExecutionWait) {
        throw new Error('当前运行环境不支持恢复等待中的命令。');
      }

      this.dependencies.sessions.resumePendingExecutionWait(
        snapshot.sessionId,
        snapshot.openGate.payload.timeoutMs
      );
    }
    this.agentRunRegistry.markGateReopened({
      runId,
      gateId,
      deadlineAt: Date.now() + snapshot.openGate.payload.timeoutMs,
    });
    pausedRun.pendingAction = { kind: 'resume_waiting' };
    return this.agentRunRegistry.getRun(runId);
  }

  resolveGate(runId: string, gateId: string) {
    const snapshot = this.agentRunRegistry.getRun(runId);
    if (!snapshot?.openGate || snapshot.openGate.id !== gateId) {
      throw new Error('指定的 human gate 不存在。');
    }
    if (snapshot.openGate.kind !== 'approval') {
      throw new Error('只有 approval gate 支持批准。');
    }

    const pausedRun = this.pausedRuns.get(runId);
    if (!pausedRun) {
      throw new Error('当前 run 没有可恢复的执行上下文。');
    }

    this.agentRunRegistry.resolveGate({ runId, gateId });
    pausedRun.pendingAction = { kind: 'resolve_approval' };
    return this.agentRunRegistry.getRun(runId);
  }

  rejectGate(runId: string, gateId: string) {
    const snapshot = this.agentRunRegistry.getRun(runId);
    if (!snapshot?.openGate || snapshot.openGate.id !== gateId) {
      throw new Error('指定的 human gate 不存在。');
    }
    if (snapshot.openGate.kind !== 'approval') {
      throw new Error('只有 approval gate 支持拒绝。');
    }

    const pausedRun = this.pausedRuns.get(runId);
    if (!pausedRun) {
      throw new Error('当前 run 没有可恢复的执行上下文。');
    }

    this.agentRunRegistry.rejectGate({ runId, gateId });
    pausedRun.pendingAction = { kind: 'reject_approval' };
    return this.agentRunRegistry.getRun(runId);
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

    const context: Context = {
      systemPrompt: buildAgentSystemPrompt({
        sessionId: input.sessionId,
        initialStepBudget,
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
    emit({
      type: 'run_state_changed',
      runId,
      state: 'running',
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
    const loopState = createAgentLoopState({
      provider: input.provider,
      model: input.model,
      runId,
      task: input.task.trim(),
      sessionId: input.sessionId,
      sessionLabel,
      approvalMode: input.approvalMode ?? 'auto-readonly',
      maxCommandOutputChars,
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

      let continueRun: PausedRunHandle['continueRun'];
      continueRun = async ({ emit: resumedEmit, signal: resumedSignal, action }) => {
        const resumed = await this.resumePausedToolCall({
          runId,
          emit: resumedEmit,
          signal: resumedSignal,
          action,
          pause: outcome.pause,
        });

        if (resumed.kind === 'paused') {
          this.pausedRuns.set(runId, {
            pause: outcome.pause,
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
        if (action.kind === 'resolve_approval' || action.kind === 'reject_approval') {
          this.agentRunRegistry.markRunRunning({
            runId,
            clearGate: true,
          });
        }
        await processLoopOutcome(nextResult.outcome, currentLoopState, resumedEmit, resumedSignal);
      };

      const pauseOutcome = await this.handlePauseOutcome({
        runId,
        input,
        step: outcome.step,
        emit: activeEmit,
        signal: activeSignal,
        pause: outcome.pause,
      });

      if (pauseOutcome.kind === 'paused') {
        this.pausedRuns.set(runId, {
          pause: outcome.pause,
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
    input: CreateAgentRunInput;
    step: number;
    emit: (event: AgentStreamEvent) => void;
    signal: AbortSignal;
    pause: ToolPauseOutcome;
  }): Promise<PauseResolution> {
    const deadlineAt =
      options.pause.gateKind === 'terminal_input'
        ? Date.now() + options.pause.payload.timeoutMs
        : Date.now() + 300_000;

    const gate = this.agentRunRegistry.openGate({
      runId: options.runId,
      sessionId: options.input.sessionId,
      kind: options.pause.gateKind,
      reason: options.pause.reason,
      deadlineAt,
      payload: options.pause.payload as never,
    });

    options.emit({
      type: 'human_gate_opened',
      runId: options.runId,
      gate,
      timestamp: Date.now(),
    });
    options.emit({
      type: 'run_state_changed',
      runId: options.runId,
      state: 'waiting_for_human',
      timestamp: Date.now(),
    });

    if (options.pause.gateKind === 'approval') {
      return { kind: 'paused' };
    }

    const terminalPause = options.pause as Extract<ToolPauseOutcome, { gateKind: 'terminal_input' }>;
    return this.waitForTerminalInputGate({
      runId: options.runId,
      sessionId: options.input.sessionId,
      gate,
      emit: options.emit,
      waitForCompletion: () => terminalPause.continuation.waitForCompletion(),
      command: terminalPause.payload.command,
    });
  }

  private async waitForTerminalInputGate(options: {
    runId: string;
    sessionId: string;
    gate: HumanGateRecord;
    emit: (event: AgentStreamEvent) => void;
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
          const rejectedGate = this.agentRunRegistry.rejectGate({
            runId: options.runId,
            gateId: options.gate.id,
          });
          options.emit({
            type: 'human_gate_rejected',
            runId: options.runId,
            gate: rejectedGate,
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
          type: 'human_gate_resolved',
          runId: options.runId,
          gate: this.agentRunRegistry.resolveGate({
            runId: options.runId,
            gateId: options.gate.id,
        }),
        timestamp: Date.now(),
      });
      this.agentRunRegistry.markRunRunning({
        runId: options.runId,
        clearGate: true,
      });
      options.emit({
        type: 'run_state_changed',
        runId: options.runId,
          state: 'running',
          timestamp: Date.now(),
        });
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

      this.agentRunRegistry.expireGate({
        runId: options.runId,
        gateId: options.gate.id,
      });
      const expiredGate = this.agentRunRegistry.getRun(options.runId)?.openGate;
      if (expiredGate) {
        options.emit({
          type: 'human_gate_expired',
          runId: options.runId,
          gate: expiredGate,
          timestamp: Date.now(),
        });
      }
      options.emit({
        type: 'run_state_changed',
        runId: options.runId,
        state: 'suspended',
        timestamp: Date.now(),
      });
      return { kind: 'paused' };
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
    if (!snapshot?.openGate) {
      throw new Error('指定 run 当前没有待处理的 human gate。');
    }

    if (options.pause.gateKind === 'approval') {
      if (snapshot.openGate.kind !== 'approval') {
        throw new Error('当前 gate 与待恢复的 approval 操作不匹配。');
      }

      if (options.action.kind === 'resolve_approval') {
        if (snapshot.openGate.status !== 'resolved') {
          throw new Error('approval gate 尚未被批准。');
        }

        options.emit({
          type: 'human_gate_resolved',
          runId: options.runId,
          gate: snapshot.openGate,
          timestamp: Date.now(),
        });
        this.agentRunRegistry.markRunRunning({
          runId: options.runId,
        });
        options.emit({
          type: 'run_state_changed',
          runId: options.runId,
          state: 'running',
          timestamp: Date.now(),
        });
        return {
          kind: 'completed',
          envelope: await options.pause.continuation.resume(options.signal),
        };
      }

      if (options.action.kind === 'reject_approval') {
        if (snapshot.openGate.status !== 'rejected') {
          throw new Error('approval gate 尚未被拒绝。');
        }

        options.emit({
          type: 'human_gate_rejected',
          runId: options.runId,
          gate: snapshot.openGate,
          timestamp: Date.now(),
        });
        this.agentRunRegistry.markRunRunning({
          runId: options.runId,
        });
        options.emit({
          type: 'run_state_changed',
          runId: options.runId,
          state: 'running',
          timestamp: Date.now(),
        });
        return {
          kind: 'completed',
          envelope: options.pause.continuation.reject(),
        };
      }

      throw new Error('approval gate 只能执行批准或拒绝操作。');
    }

    if (options.action.kind !== 'resume_waiting') {
      throw new Error('terminal_input gate 只能继续等待。');
    }
    if (snapshot.openGate.kind !== 'terminal_input') {
      throw new Error('当前 gate 与待恢复的 terminal_input 操作不匹配。');
    }
    if (snapshot.openGate.status !== 'open') {
      throw new Error('terminal_input gate 当前不处于等待状态。');
    }

    const terminalPause = options.pause as Extract<ToolPauseOutcome, { gateKind: 'terminal_input' }>;
    return this.waitForTerminalInputGate({
      runId: options.runId,
      sessionId: snapshot.sessionId,
      gate: snapshot.openGate,
      emit: options.emit,
      waitForCompletion: () => terminalPause.continuation.waitForCompletion(options.signal),
      command: terminalPause.payload.command,
    });
  }
}
