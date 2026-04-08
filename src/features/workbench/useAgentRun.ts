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
  HumanGateRecord,
  InteractionAction,
  InteractionRequest,
} from './types.agent';
import type { PendingUiGateItem } from './agentPendingGateModel';
import { isTerminalWaitGate } from './agentGatePresentationModel';
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
};

export type UseAgentRunResult = ReturnType<typeof useAgentRun>;

function createItemId() {
  return crypto.randomUUID();
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
  const [pendingInteractions, setPendingInteractions] = useState<PendingUiGateItem[]>([]);
  const [compatActiveGate, setCompatActiveGate] = useState<HumanGateRecord | null>(null);
  const [compatPendingUiGates, setCompatPendingUiGates] = useState<PendingUiGateItem[]>([]);
  const [pendingContinuationRunId, setPendingContinuationRunId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventStateRef = useRef({
    runId: null as string | null,
    runState: null as AgentRunState | null,
    executionState: null as AgentRunExecutionState | null,
    blockingMode: null as AgentRunBlockingMode | null,
    activeInteraction: null as InteractionRequest | null,
    pendingInteractions: [] as PendingUiGateItem[],
    activeGate: null as HumanGateRecord | null,
    pendingUiGates: [] as PendingUiGateItem[],
    error: null as string | null,
  });

  function isTerminalWaitInteraction(interaction: InteractionRequest | null) {
    return interaction?.interactionKind === 'terminal_wait';
  }

  function getPendingContinuationRunIdFromSnapshot(snapshot: {
    runId: string;
    state: AgentRunState;
    activeInteraction: InteractionRequest | null;
    openGate: HumanGateRecord | null;
  }) {
    if (isTerminalWaitInteraction(snapshot.activeInteraction)) {
      return snapshot.runId;
    }

    if (isTerminalWaitGate(snapshot.openGate)) {
      return snapshot.runId;
    }

    if (snapshot.state === 'suspended' && snapshot.openGate?.kind === 'terminal_input') {
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
    setCompatActiveGate(nextEventState.activeGate ?? null);
    setCompatPendingUiGates(nextEventState.pendingUiGates ?? nextEventState.pendingInteractions);
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
        setRunState('completed');
        setActiveInteraction(null);
        setCompatActiveGate(null);
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
            openGate: snapshot.openGate ?? null,
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
    async ({ providerId, model, maxSteps, task, sessionId }: RunAgentOptions) => {
      const normalizedTask = task.trim();
      if (!normalizedTask) {
        return;
      }

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
        activeGate: null,
        pendingUiGates: [],
        error: null,
      };
      setIsRunning(true);
      setRunId(null);
      setRunState('running');
      setExecutionState('running');
      setBlockingMode('none');
      setActiveInteraction(null);
      setPendingInteractions([]);
      setCompatActiveGate(null);
      setCompatPendingUiGates([]);
      setPendingContinuationRunId(null);
      appendItem({
        id: createItemId(),
        kind: 'user',
        text: normalizedTask,
      });

      try {
        await streamAgentRun({
          providerId,
          model,
          maxSteps,
          task: normalizedTask,
          sessionId,
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

  const continuePendingRun = useCallback(
    async (runIdToContinue: string) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setError(null);
      eventStateRef.current = {
        ...eventStateRef.current,
        error: null,
      };
      setIsRunning(true);

      try {
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

        const message = runError instanceof Error ? runError.message : 'Agent 继续执行失败';
        setError(message);
        appendItem({
          id: createItemId(),
          kind: 'status',
          text: `继续执行失败：${message}。可点击“继续运行”重试。`,
        });
      } finally {
        abortControllerRef.current = null;
        setIsRunning(false);
      }
    },
    [appendItem, handleEvent]
  );

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

    const gate = eventStateRef.current.activeGate;
    if (gate?.id === requestId) {
      if (gate.kind === 'approval') {
        return preferredKinds.includes('approve') ? 'approve' : preferredKinds[0];
      }

      if (gate.kind === 'parameter_confirmation') {
        return preferredKinds.includes('submit') ? 'submit' : preferredKinds[0];
      }
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

  const resumeGate = useCallback(
    async (runIdToContinue: string, requestId: string) => {
      await submitInteraction(runIdToContinue, requestId, ['continue_waiting']);
    },
    [submitInteraction]
  );

  const approveGate = useCallback(
    async (
      runIdToContinue: string,
      requestId: string,
      input?: { fields?: Record<string, string> }
    ) => {
      await submitInteraction(
        runIdToContinue,
        requestId,
        ['approve', 'submit'],
        input?.fields ? { fields: input.fields } : {}
      );
    },
    [submitInteraction]
  );

  const rejectGate = useCallback(
    async (runIdToContinue: string, requestId: string) => {
      await submitInteraction(runIdToContinue, requestId, ['reject', 'cancel']);
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
      activeGate: null,
      pendingUiGates: [],
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
    setCompatActiveGate(null);
    setCompatPendingUiGates([]);
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
        openGate: snapshot.openGate ?? null,
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
    activeGate: compatActiveGate,
    pendingUiGates: compatPendingUiGates,
    pendingContinuationRunId,
    runAgent,
    stopAgent,
    approveGate,
    rejectGate,
    resumeGate,
    continuePendingRun,
    loadReattachableRun,
    clearItems,
  };
}
