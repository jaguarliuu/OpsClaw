import {
  validateToolCall,
  type AssistantMessage,
  type Context,
  type Tool,
  type ToolCall,
  type ToolResultMessage,
} from '@mariozechner/pi-ai';

import { completeAgentContext, streamAgentContext } from '../llmClient.js';
import type { StoredLlmProvider } from '../llmProviderStore.js';
import type { EffectiveOpsClawRules } from './controlledExecutionTypes.js';
import type { AgentApprovalMode, AgentStreamEvent, ToolExecutionEnvelope } from './agentTypes.js';
import type { FileMemoryStore } from './fileMemoryStore.js';
import { logAgent } from './logger.js';
import type { ToolCallExecutor } from './toolExecutor.js';
import type { ToolExecutionContext, ToolPauseOutcome, ToolRegistry } from './toolTypes.js';

const STEP_BUDGET_RENEWAL_GRANTS = [4, 2, 1] as const;
const NO_PROGRESS_WINDOW_SIZE = 3;

export type StableObservation = {
  command: string;
  exitCode: number;
  output: string;
  durationMs: number;
};

type StepBudgetProgress = {
  madeProgress: boolean;
};

type AgentLoopStepResult =
  | { kind: 'completed_step' }
  | { kind: 'completed'; finalAnswer: string; step: number }
  | { kind: 'failed'; error: string; step: number }
  | { kind: 'cancelled'; step: number }
  | { kind: 'paused'; step: number; pause: ToolPauseOutcome };

export type AgentLoopOutcome =
  | { kind: 'completed'; finalAnswer: string; steps: number; stableObservations: StableObservation[] }
  | { kind: 'failed'; error: string; step: number }
  | { kind: 'cancelled'; step: number }
  | { kind: 'paused'; step: number; pause: ToolPauseOutcome };

type PendingToolExecution = {
  step: number;
  pausedToolCall: ToolCall;
  toolCalls: ToolCall[];
  nextToolIndex: number;
  stepMadeProgress: boolean;
  stepHadSuccessfulToolExecution: boolean;
  stepHasNewToolCallSignature: boolean;
};

export type CreateAgentLoopOptions = {
  provider: StoredLlmProvider;
  model: string;
  runId: string;
  task: string;
  sessionId: string;
  sessionLabel: string;
  sessionGroupName: string | null;
  approvalMode: AgentApprovalMode;
  maxCommandOutputChars: number;
  effectiveRules: EffectiveOpsClawRules;
  hardMaxSteps: number;
  initialStepBudget: number;
  context: Context;
  toolRegistry: ToolRegistry;
  toolExecutor: ToolCallExecutor;
  sessions: ToolExecutionContext['capabilities']['sessions'];
  fileMemory: FileMemoryStore;
  completeAgentContext: typeof completeAgentContext;
  streamAgentContext?: typeof streamAgentContext | null;
};

export type AgentLoopState = CreateAgentLoopOptions & {
  currentStepBudget: number;
  stepBudgetRenewalGrants: number[];
  stepBudgetRenewalIndex: number;
  stableObservations: StableObservation[];
  seenToolCallSignatures: Set<string>;
  seenSuccessfulResultSignatures: Set<string>;
  stepProgressHistory: StepBudgetProgress[];
  pendingToolExecution: PendingToolExecution | null;
};

export type AgentLoopExecutionResult = {
  events: AgentStreamEvent[];
  outcome: AgentLoopOutcome;
};

type AgentLoopEventSink = {
  events: AgentStreamEvent[];
  onEvent?: (event: AgentStreamEvent) => void;
};

function recordAgentLoopEvent(sink: AgentLoopEventSink, event: AgentStreamEvent) {
  sink.events.push(event);
  sink.onEvent?.(event);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') {
      return JSON.stringify(value.slice(0, 300));
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
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

function buildStepBudgetRenewalGrants(hardMaxSteps: number, initialStepBudget: number) {
  const grants: number[] = [];
  let remaining = Math.max(0, hardMaxSteps - initialStepBudget);

  for (const grant of STEP_BUDGET_RENEWAL_GRANTS) {
    if (remaining <= 0) {
      break;
    }

    const nextGrant = Math.min(grant, remaining);
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
  return stepProgressHistory.slice(-NO_PROGRESS_WINDOW_SIZE).some((entry) => entry.madeProgress);
}

export function extractStableObservation(envelope: ToolExecutionEnvelope): StableObservation | null {
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

export function extractAssistantText(message: AssistantMessage) {
  return message.content
    .filter((block): block is Extract<AssistantMessage['content'][number], { type: 'text' }> => block.type === 'text')
    .map((block) => block.text.trim())
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
  eventSink: AgentLoopEventSink;
  runId: string;
  step: number;
}) {
  for await (const event of options.stream) {
    if (event.type === 'text_delta' && event.delta) {
      recordAgentLoopEvent(options.eventSink, {
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

function finalizeOutcome(
  state: AgentLoopState,
  result: Exclude<AgentLoopStepResult, { kind: 'completed_step' }>
): AgentLoopOutcome {
  if (result.kind === 'completed') {
    return {
      kind: 'completed',
      finalAnswer: result.finalAnswer,
      steps: result.step,
      stableObservations: [...state.stableObservations],
    };
  }

  return result;
}

function finalizeToolEnvelope(options: {
  state: AgentLoopState;
  toolCall: ToolCall;
  envelope: ToolExecutionEnvelope;
  step: number;
  eventSink: AgentLoopEventSink;
  stepContext: {
    stepMadeProgress: boolean;
    stepHadSuccessfulToolExecution: boolean;
  };
}) {
  logAgent('tool_execution_finished', {
    runId: options.state.runId,
    step: options.step,
    toolCallId: options.toolCall.id,
    toolName: options.toolCall.name,
    ok: options.envelope.ok,
    durationMs: options.envelope.meta.durationMs,
    error: options.envelope.error?.message,
  });

  const stableObservation = extractStableObservation(options.envelope);
  if (stableObservation) {
    options.state.stableObservations.push(stableObservation);
  }

  const resultSignature = buildToolResultSignature(options.envelope);
  if (resultSignature) {
    options.stepContext.stepHadSuccessfulToolExecution = true;
    if (!options.state.seenSuccessfulResultSignatures.has(resultSignature)) {
      options.state.seenSuccessfulResultSignatures.add(resultSignature);
      options.stepContext.stepMadeProgress = true;
    }
  }

  options.state.context.messages.push(
    buildToolResultMessage(options.envelope, options.toolCall.id, options.toolCall.name)
  );

  recordAgentLoopEvent(options.eventSink, {
    type: 'tool_execution_finished',
    runId: options.state.runId,
    step: options.step,
    toolCallId: options.toolCall.id,
    toolName: options.toolCall.name,
    result: options.envelope,
    timestamp: Date.now(),
  });
}

function finalizeStep(options: {
  state: AgentLoopState;
  step: number;
  stepContext: {
    stepMadeProgress: boolean;
    stepHadSuccessfulToolExecution: boolean;
    stepHasNewToolCallSignature: boolean;
  };
  eventSink: AgentLoopEventSink;
}): AgentLoopStepResult {
  if (
    !options.stepContext.stepMadeProgress &&
    options.stepContext.stepHasNewToolCallSignature &&
    options.stepContext.stepHadSuccessfulToolExecution
  ) {
    options.stepContext.stepMadeProgress = true;
  }

  options.state.stepProgressHistory.push({
    madeProgress: options.stepContext.stepMadeProgress,
  });

  if (options.step !== options.state.currentStepBudget) {
    return { kind: 'completed_step' };
  }

  const grant = options.state.stepBudgetRenewalGrants[options.state.stepBudgetRenewalIndex];
  if (grant !== undefined && hasRecentProgress(options.state.stepProgressHistory)) {
    options.state.currentStepBudget = Math.min(
      options.state.currentStepBudget + grant,
      options.state.hardMaxSteps
    );
    options.state.stepBudgetRenewalIndex += 1;
    logAgent('run_budget_extended', {
      runId: options.state.runId,
      step: options.step,
      grant,
      nextBudget: options.state.currentStepBudget,
      hardMaxSteps: options.state.hardMaxSteps,
    });
    recordAgentLoopEvent(options.eventSink, {
      type: 'warning',
      runId: options.state.runId,
      message: `已达到当前步数预算 ${options.step}，检测到仍有进展，自动续期 +${grant} 步（当前上限 ${options.state.currentStepBudget} / ${options.state.hardMaxSteps}）。`,
      step: options.step,
      timestamp: Date.now(),
    });
    return { kind: 'completed_step' };
  }

  const madeRecentProgress = hasRecentProgress(options.state.stepProgressHistory);
  recordAgentLoopEvent(options.eventSink, {
    type: 'warning',
    runId: options.state.runId,
    message: madeRecentProgress
      ? `已达到总执行上限 ${options.state.currentStepBudget}，Agent 停止继续尝试。`
      : `已达到当前步数预算 ${options.step}，最近几步没有有效进展，Agent 停止继续尝试。`,
    step: options.step,
    timestamp: Date.now(),
  });

  return {
    kind: 'failed',
    error: madeRecentProgress
      ? '已达到总执行上限，请缩小任务范围或提供更具体的目标。'
      : '已达到当前步数预算且最近几步没有有效进展，请缩小任务范围或提供更具体的目标。',
    step: options.step,
  };
}

async function executeToolCallsFromIndex(options: {
  state: AgentLoopState;
  step: number;
  toolCalls: ToolCall[];
  startIndex: number;
  availableTools: Tool[];
  signal: AbortSignal;
  eventSink: AgentLoopEventSink;
  stepContext: {
    stepMadeProgress: boolean;
    stepHadSuccessfulToolExecution: boolean;
    stepHasNewToolCallSignature: boolean;
  };
}): Promise<AgentLoopStepResult> {
  for (let index = options.startIndex; index < options.toolCalls.length; index += 1) {
    const toolCall = options.toolCalls[index]!;

    if (options.signal.aborted) {
      return { kind: 'cancelled', step: options.step };
    }

    recordAgentLoopEvent(options.eventSink, {
      type: 'tool_call',
      runId: options.state.runId,
      step: options.step,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      timestamp: Date.now(),
    });
    logAgent('tool_call_received', {
      runId: options.state.runId,
      step: options.step,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
    });

    let validatedArgs: unknown;
    try {
      validatedArgs = validateToolCall(options.availableTools, toolCall);
      logAgent('tool_call_validated', {
        runId: options.state.runId,
        step: options.step,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      });
    } catch (error) {
      logAgent('tool_call_validation_failed', {
        runId: options.state.runId,
        step: options.step,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        error: error instanceof Error ? error.message : '工具参数校验失败。',
      });
      finalizeToolEnvelope({
        state: options.state,
        toolCall,
        envelope: {
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
        },
        step: options.step,
        eventSink: options.eventSink,
        stepContext: options.stepContext,
      });
      continue;
    }

    const executionResult = await options.state.toolExecutor.executeToolCall(toolCall, validatedArgs, {
      runId: options.state.runId,
      userTask: options.state.task.trim(),
      sessionId: options.state.sessionId,
      sessionLabel: options.state.sessionLabel,
      sessionGroupName: options.state.sessionGroupName,
      step: options.step,
      approvalMode: options.state.approvalMode,
      maxCommandOutputChars: options.state.maxCommandOutputChars,
      effectiveRules: options.state.effectiveRules,
      signal: options.signal,
      capabilities: {
        sessions: options.state.sessions as never,
        fileMemory: options.state.fileMemory,
      },
      emit: (event) => {
        recordAgentLoopEvent(options.eventSink, event);
      },
    });

    if (executionResult.kind === 'pause') {
      options.state.pendingToolExecution = {
        step: options.step,
        pausedToolCall: toolCall,
        toolCalls: options.toolCalls,
        nextToolIndex: index + 1,
        stepMadeProgress: options.stepContext.stepMadeProgress,
        stepHadSuccessfulToolExecution: options.stepContext.stepHadSuccessfulToolExecution,
        stepHasNewToolCallSignature: options.stepContext.stepHasNewToolCallSignature,
      };
      return {
        kind: 'paused',
        step: options.step,
        pause: executionResult,
      };
    }

    finalizeToolEnvelope({
      state: options.state,
      toolCall,
      envelope: executionResult.envelope,
      step: options.step,
      eventSink: options.eventSink,
      stepContext: options.stepContext,
    });
  }

  return finalizeStep({
    state: options.state,
    step: options.step,
    stepContext: options.stepContext,
    eventSink: options.eventSink,
  });
}

async function runStep(
  state: AgentLoopState,
  step: number,
  signal: AbortSignal,
  eventSink: AgentLoopEventSink
): Promise<AgentLoopOutcome> {
  if (signal.aborted) {
    return { kind: 'cancelled', step };
  }

  logAgent('step_model_request_started', {
    runId: state.runId,
    step,
  });
  const assistantMessage = state.streamAgentContext
    ? await consumeAssistantMessageStream({
        stream: state.streamAgentContext(state.provider, state.model, state.context, signal),
        eventSink,
        runId: state.runId,
        step,
      })
    : await state.completeAgentContext(
        state.provider,
        state.model,
        state.context,
        signal
      );

  state.context.messages.push(assistantMessage);
  logAgent('step_model_request_finished', {
    runId: state.runId,
    step,
    stopReason: assistantMessage.stopReason,
    contentBlocks: assistantMessage.content.length,
  });

  const assistantText = extractAssistantText(assistantMessage);
  if (assistantText) {
    recordAgentLoopEvent(eventSink, {
      type: 'assistant_message',
      runId: state.runId,
      text: assistantText,
      step,
      timestamp: Date.now(),
    });
  }

  if (assistantMessage.stopReason === 'stop') {
    return {
      kind: 'completed',
      finalAnswer: assistantText || '任务已完成。',
      steps: step,
      stableObservations: [...state.stableObservations],
    };
  }

  if (assistantMessage.stopReason === 'error') {
    return {
      kind: 'failed',
      error: assistantMessage.errorMessage?.trim() || '模型请求失败。',
      step,
    };
  }

  if (assistantMessage.stopReason === 'aborted') {
    return { kind: 'cancelled', step };
  }

  if (assistantMessage.stopReason === 'length') {
    return {
      kind: 'failed',
      error: '模型输出达到长度上限，Agent 已停止。',
      step,
    };
  }

  if (assistantMessage.stopReason !== 'toolUse') {
    return {
      kind: 'failed',
      error: '模型返回了未处理的 stopReason。',
      step,
    };
  }

  const availableTools = await state.toolRegistry.listPiTools({
    sessionId: state.sessionId,
  });
  const toolCalls = extractToolCalls(assistantMessage);
  logAgent('step_tool_calls_detected', {
    runId: state.runId,
    step,
    toolCalls: toolCalls.map((call) => call.name),
  });

  if (toolCalls.length === 0) {
    return {
      kind: 'failed',
      error: '模型请求了工具调用，但未返回任何工具。',
      step,
    };
  }

  const stepHasNewToolCallSignature = toolCalls.some((toolCall) => {
    const signature = buildToolCallSignature(toolCall);
    const isNew = !state.seenToolCallSignatures.has(signature);
    state.seenToolCallSignatures.add(signature);
    return isNew;
  });

  const stepResult = await executeToolCallsFromIndex({
    state,
    step,
    toolCalls,
    startIndex: 0,
    availableTools,
    signal,
    eventSink,
    stepContext: {
      stepMadeProgress: false,
      stepHadSuccessfulToolExecution: false,
      stepHasNewToolCallSignature,
    },
  });

  if (stepResult.kind === 'completed_step') {
    return runStep(state, step + 1, signal, eventSink);
  }

  return finalizeOutcome(
    state,
    stepResult as Exclude<AgentLoopStepResult, { kind: 'completed_step' }>
  );
}

export function createAgentLoopState(options: CreateAgentLoopOptions): AgentLoopState {
  return {
    ...options,
    currentStepBudget: options.initialStepBudget,
    stepBudgetRenewalGrants: buildStepBudgetRenewalGrants(
      options.hardMaxSteps,
      options.initialStepBudget
    ),
    stepBudgetRenewalIndex: 0,
    stableObservations: [],
    seenToolCallSignatures: new Set<string>(),
    seenSuccessfulResultSignatures: new Set<string>(),
    stepProgressHistory: [],
    pendingToolExecution: null,
  };
}

export async function runAgentLoop(
  state: AgentLoopState,
  signal: AbortSignal,
  onEvent?: (event: AgentStreamEvent) => void
): Promise<AgentLoopExecutionResult> {
  if (state.pendingToolExecution) {
    throw new Error('当前 loop 已暂停，不能重复启动。');
  }

  const events: AgentStreamEvent[] = [];
  const outcome = await runStep(state, 1, signal, { events, onEvent });
  return {
    events,
    outcome,
  };
}

export async function resumeAgentLoop(
  state: AgentLoopState,
  envelope: ToolExecutionEnvelope,
  signal: AbortSignal,
  onEvent?: (event: AgentStreamEvent) => void
): Promise<AgentLoopExecutionResult> {
  const pending = state.pendingToolExecution;
  if (!pending) {
    throw new Error('当前 loop 没有待恢复的工具调用。');
  }

  const events: AgentStreamEvent[] = [];
  const eventSink = { events, onEvent };
  const stepContext = {
    stepMadeProgress: pending.stepMadeProgress,
    stepHadSuccessfulToolExecution: pending.stepHadSuccessfulToolExecution,
    stepHasNewToolCallSignature: pending.stepHasNewToolCallSignature,
  };

  finalizeToolEnvelope({
    state,
    toolCall: pending.pausedToolCall,
    envelope,
    step: pending.step,
    eventSink,
    stepContext,
  });

  const availableTools = await state.toolRegistry.listPiTools({
    sessionId: state.sessionId,
  });
  const resumedResult = await executeToolCallsFromIndex({
    state,
    step: pending.step,
    toolCalls: pending.toolCalls,
    startIndex: pending.nextToolIndex,
    availableTools,
    signal,
    eventSink,
    stepContext,
  });

  const outcome =
    resumedResult.kind === 'completed_step'
      ? await runStep(state, pending.step + 1, signal, eventSink)
      : finalizeOutcome(
          state,
          resumedResult as Exclude<AgentLoopStepResult, { kind: 'completed_step' }>
        );

  if (state.pendingToolExecution === pending) {
    state.pendingToolExecution = null;
  }

  return {
    events,
    outcome,
  };
}
