import { useCallback, useRef, useState } from 'react';

import {
  getReattachableAgentRun,
  submitAgentInteraction,
  streamAgentRun,
  streamAgentRunContinuation,
} from './agentApi';
import type {
  AgentRunBlockingMode,
  AgentRunExecutionState,
  AgentRunState,
  AgentRunSnapshot,
  AgentStreamEvent,
  AgentTimelineItem,
  InteractionAction,
  InteractionRequest,
} from './types.agent';
import type { PendingInteractionItem } from './agentInteractionModel';
import {
  applyAgentEventToTimeline,
  projectAgentSnapshotToEventState,
  reduceAgentEventState,
} from './useAgentRunModel';

type RunAgentOptions = {
  providerId: string;
  model: string;
  maxSteps?: number;
  task: string;
  sessionId: string;
  terminalSnapshot?: string;
};

export type UseAgentRunResult = ReturnType<typeof useAgentRun>;

function createItemId() {
  return crypto.randomUUID();
}

function getRecentLines(transcript: string, maxChars = 3000): string {
  if (transcript.length <= maxChars) return transcript;
  const tail = transcript.slice(-maxChars);
  const firstNewline = tail.indexOf('\n');
  return firstNewline > 0 ? tail.slice(firstNewline + 1) : tail;
}

export function useAgentRun() {
  const [items, setItems] = useState<AgentTimelineItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runState, setRunState] = useState<AgentRunState | null>(null);
  const [executionState, setExecutionState] = useState<AgentRunExecutionState | null>(null);
  const [blockingMode, setBlockingMode] = useState<AgentRunBlockingMode | null>(null);
  const [activeInteraction, setActiveInteraction] = useState<InteractionRequest | null>(null);
  const [pendingInteractions, setPendingInteractions] = useState<PendingInteractionItem[]>([]);
  const [pendingContinuationRunId, setPendingContinuationRunId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationHistoryRef = useRef<Map<string, Array<{ role: 'user' | 'assistant'; text: string }>>>(new Map());
  const currentRunTaskRef = useRef<{ sessionId: string; task: string } | null>(null);
  const eventStateRef = useRef({
    runId: null as string | null,
    runState: null as AgentRunState | null,
    executionState: null as AgentRunExecutionState | null,
    blockingMode: null as AgentRunBlockingMode | null,
    activeInteraction: null as InteractionRequest | null,
    pendingInteractions: [] as PendingInteractionItem[],
    error: null as string | null,
  });

  function isTerminalWaitInteraction(interaction: InteractionRequest | null) {
    return interaction?.interactionKind === 'terminal_wait';
  }

  function getPendingContinuationRunIdFromSnapshot(snapshot: {
    runId: string;
    state: AgentRunState;
    activeInteraction: InteractionRequest | null;
  }) {
    if (isTerminalWaitInteraction(snapshot.activeInteraction)) {
      return snapshot.runId;
    }

    return null;
  }

  function syncEventState(nextEventState: typeof eventStateRef.current) {
    setRunId(nextEventState.runId);
    setRunState(nextEventState.runState);
    setExecutionState(nextEventState.executionState);
    setBlockingMode(nextEventState.blockingMode);
    setActiveInteraction(nextEventState.activeInteraction);
    setPendingInteractions(nextEventState.pendingInteractions);
    setError(nextEventState.error);
  }

  function applySnapshotToEventState(snapshot: AgentRunSnapshot) {
    const nextEventState = projectAgentSnapshotToEventState(eventStateRef.current, snapshot);
    eventStateRef.current = nextEventState;
    syncEventState(nextEventState);
  }

  const appendItem = useCallback((item: AgentTimelineItem) => {
    setItems((current) => [...current, item]);
  }, []);

  const handleEvent = useCallback(
    (event: AgentStreamEvent) => {
      const nextEventState = reduceAgentEventState(eventStateRef.current, event);
      eventStateRef.current = nextEventState;
      syncEventState(nextEventState);

      setItems((current): AgentTimelineItem[] =>
        applyAgentEventToTimeline(current, event, createItemId)
      );

      if (event.type === 'run_started') {
        setPendingContinuationRunId(null);
        return;
      }

      if (event.type === 'run_state_changed') {
        setPendingContinuationRunId(
          nextEventState.runId && isTerminalWaitInteraction(nextEventState.activeInteraction)
            ? nextEventState.runId
            : null
        );
        return;
      }

      if (
        event.type === 'interaction_requested' ||
        event.type === 'interaction_updated'
      ) {
        setPendingContinuationRunId(
          nextEventState.runId && isTerminalWaitInteraction(nextEventState.activeInteraction)
            ? nextEventState.runId
            : null
        );
        return;
      }

      if (
        event.type === 'interaction_resolved' ||
        event.type === 'interaction_rejected' ||
        event.type === 'interaction_expired'
      ) {
        setPendingContinuationRunId(null);
        return;
      }

      if (event.type === 'run_completed') {
        const runMeta = currentRunTaskRef.current;
        if (runMeta) {
          const history = conversationHistoryRef.current.get(runMeta.sessionId) ?? [];
          const next = [
            ...history,
            { role: 'user' as const, text: runMeta.task },
            { role: 'assistant' as const, text: event.finalAnswer },
          ].slice(-20);
          conversationHistoryRef.current.set(runMeta.sessionId, next);
          currentRunTaskRef.current = null;
        }
        setRunState('completed');
        setActiveInteraction(null);
        setPendingContinuationRunId(null);
        setIsRunning(false);
        return;
      }

      if (event.type === 'run_failed') {
        setPendingContinuationRunId(null);
        setIsRunning(false);
        return;
      }

      if (event.type === 'run_cancelled') {
        setPendingContinuationRunId(null);
        setIsRunning(false);
      }
    },
    []
  );

  const continueRun = useCallback(
    async (
      runIdToContinue: string,
      action: () => Promise<AgentRunSnapshot>
    ) => {
      const controller = new AbortController();
      let actionApplied = false;
      abortControllerRef.current = controller;
      setError(null);
      eventStateRef.current = {
        ...eventStateRef.current,
        error: null,
      };
      setIsRunning(true);

      try {
        const snapshot = await action();
        actionApplied = true;
        applySnapshotToEventState(snapshot);
        setPendingContinuationRunId(
          getPendingContinuationRunIdFromSnapshot({
            runId: snapshot.runId,
            state: snapshot.state,
            activeInteraction: snapshot.activeInteraction,
          })
        );

        await streamAgentRunContinuation({
          runId: runIdToContinue,
          signal: controller.signal,
          onEvent: handleEvent,
        });
        setPendingContinuationRunId(null);
      } catch (runError) {
        if (runError instanceof Error && runError.name === 'AbortError') {
          appendItem({
            id: createItemId(),
            kind: 'status',
            text: 'Agent 已停止。',
          });
          return;
        }

        const message = runError instanceof Error ? runError.message : 'Agent 执行失败';
        setError(message);
        appendItem({
          id: createItemId(),
          kind: 'status',
          text: actionApplied
            ? `继续执行失败：${message}。可点击“继续运行”重试。`
            : `执行失败：${message}`,
        });
      } finally {
        abortControllerRef.current = null;
        setIsRunning(false);
      }
    },
    [appendItem, handleEvent]
  );

  const runAgent = useCallback(
    async ({ providerId, model, maxSteps, task, sessionId, terminalSnapshot }: RunAgentOptions) => {
      const normalizedTask = task.trim();
      if (!normalizedTask) {
        return;
      }

      const recentSnapshot = terminalSnapshot?.trim()
        ? getRecentLines(terminalSnapshot)
        : null;
      const taskWithContext = recentSnapshot
        ? `[当前终端最近输出]\n\`\`\`\n${recentSnapshot}\n\`\`\`\n\n用户任务：${normalizedTask}`
        : normalizedTask;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setError(null);
      eventStateRef.current = {
        runId: null,
        runState: 'running',
        executionState: 'running',
        blockingMode: 'none',
        activeInteraction: null,
        pendingInteractions: [],
        error: null,
      };
      setIsRunning(true);
      setRunId(null);
      setRunState('running');
      setExecutionState('running');
      setBlockingMode('none');
      setActiveInteraction(null);
      setPendingInteractions([]);
      setPendingContinuationRunId(null);
      appendItem({
        id: createItemId(),
        kind: 'user',
        text: normalizedTask,
      });
      currentRunTaskRef.current = { sessionId, task: normalizedTask };

      try {
        await streamAgentRun({
          providerId,
          model,
          maxSteps,
          task: taskWithContext,
          sessionId,
          conversationHistory: conversationHistoryRef.current.get(sessionId),
          signal: controller.signal,
          onEvent: handleEvent,
        });
      } catch (runError) {
        if (runError instanceof Error && runError.name === 'AbortError') {
          appendItem({
            id: createItemId(),
            kind: 'status',
            text: 'Agent 已停止。',
          });
          return;
        }

        setError(runError instanceof Error ? runError.message : 'Agent 执行失败');
        appendItem({
          id: createItemId(),
          kind: 'status',
          text: `执行失败：${runError instanceof Error ? runError.message : 'Agent 执行失败'}`,
        });
      } finally {
        abortControllerRef.current = null;
        setIsRunning(false);
      }
    },
    [appendItem, handleEvent]
  );

  const stopAgent = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsRunning(false);
  }, []);

  function getSelectedAction(
    requestId: string,
    preferredKinds: InteractionAction['kind'][]
  ) {
    const request = eventStateRef.current.activeInteraction;
    if (request?.id === requestId) {
      const preferredAction = preferredKinds.find((kind) =>
        request.actions.some((action) => action.kind === kind)
      );
      if (preferredAction) {
        return preferredAction;
      }

      return request.actions[0]?.id ?? preferredKinds[0];
    }

    return preferredKinds[0];
  }

  const submitInteraction = useCallback(
    async (
      runIdToContinue: string,
      requestId: string,
      preferredKinds: InteractionAction['kind'][],
      payload: Record<string, unknown> = {}
    ) => {
      await continueRun(runIdToContinue, () =>
        submitAgentInteraction(runIdToContinue, requestId, {
          selectedAction: getSelectedAction(requestId, preferredKinds),
          payload,
        })
      );
    },
    [continueRun]
  );

  const submitInteractionAction = useCallback(
    async (
      runIdToContinue: string,
      requestId: string,
      actionId: string,
      payload: Record<string, unknown> = {}
    ) => {
      const request = eventStateRef.current.activeInteraction;
      const selectedAction =
        request?.id === requestId
          ? request.actions.find((action) => action.id === actionId)?.kind
          : null;

      if (!selectedAction) {
        throw new Error('当前交互动作不存在或已失效。');
      }

      await submitInteraction(runIdToContinue, requestId, [selectedAction], payload);
    },
    [submitInteraction]
  );

  const clearItems = useCallback(() => {
    eventStateRef.current = {
      runId: null,
      runState: null,
      executionState: null,
      blockingMode: null,
      activeInteraction: null,
      pendingInteractions: [],
      error: null,
    };
    setItems([]);
    setError(null);
    setRunId(null);
    setRunState(null);
    setExecutionState(null);
    setBlockingMode(null);
    setActiveInteraction(null);
    setPendingInteractions([]);
    setPendingContinuationRunId(null);
  }, []);

  const loadReattachableRun = useCallback(async (sessionId: string) => {
    const snapshot = await getReattachableAgentRun(sessionId);
    if (!snapshot) {
      return null;
    }

    applySnapshotToEventState(snapshot);
    setPendingContinuationRunId(
      getPendingContinuationRunIdFromSnapshot({
        runId: snapshot.runId,
        state: snapshot.state,
        activeInteraction: snapshot.activeInteraction,
      })
    );
    return snapshot;
  }, []);

  return {
    items,
    isRunning,
    error,
    runId,
    runState,
    executionState,
    blockingMode,
    activeInteraction,
    pendingInteractions,
    pendingContinuationRunId,
    runAgent,
    stopAgent,
    submitInteraction: submitInteractionAction,
    loadReattachableRun,
    clearItems,
  };
}
