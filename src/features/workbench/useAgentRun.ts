import { useCallback, useRef, useState } from 'react';

import {
  getReattachableAgentRun,
  rejectAgentGate,
  resolveAgentGate,
  resumeAgentGate,
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
} from './types.agent';
import { buildPendingUiGateItems } from './agentPendingGateModel';
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
  const [activeGate, setActiveGate] = useState<HumanGateRecord | null>(null);
  const [pendingUiGates, setPendingUiGates] = useState(buildPendingUiGateItems([]));
  const [pendingContinuationRunId, setPendingContinuationRunId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventStateRef = useRef({
    runId: null as string | null,
    runState: null as AgentRunState | null,
    executionState: null as AgentRunExecutionState | null,
    blockingMode: null as AgentRunBlockingMode | null,
    activeGate: null as HumanGateRecord | null,
    pendingUiGates: buildPendingUiGateItems([]),
    error: null as string | null,
  });

  function getPendingContinuationRunIdFromSnapshot(snapshot: {
    runId: string;
    state: AgentRunState;
    openGate: HumanGateRecord | null;
  }) {
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
    setActiveGate(nextEventState.activeGate);
    setPendingUiGates(nextEventState.pendingUiGates);
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
          nextEventState.runId && isTerminalWaitGate(nextEventState.activeGate)
            ? nextEventState.runId
            : null
        );
        return;
      }

      if (event.type === 'human_gate_opened' || event.type === 'human_gate_expired') {
        setPendingContinuationRunId(
          nextEventState.runId && isTerminalWaitGate(nextEventState.activeGate)
            ? nextEventState.runId
            : null
        );
        return;
      }

      if (event.type === 'human_gate_resolved' || event.type === 'human_gate_rejected') {
        setPendingContinuationRunId(null);
        return;
      }

      if (event.type === 'run_completed') {
        setRunState('completed');
        setActiveGate(null);
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
            openGate: snapshot.openGate,
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
        activeGate: null,
        pendingUiGates: [],
        error: null,
      };
      setIsRunning(true);
      setRunId(null);
      setRunState('running');
      setExecutionState('running');
      setBlockingMode('none');
      setActiveGate(null);
      setPendingUiGates([]);
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

  const resumeGate = useCallback(
    async (runIdToContinue: string, gateId: string) => {
      await continueRun(runIdToContinue, () => resumeAgentGate(runIdToContinue, gateId));
    },
    [continueRun]
  );

  const approveGate = useCallback(
    async (
      runIdToContinue: string,
      gateId: string,
      input?: { fields?: Record<string, string> }
    ) => {
      await continueRun(runIdToContinue, () => resolveAgentGate(runIdToContinue, gateId, input));
    },
    [continueRun]
  );

  const rejectGate = useCallback(
    async (runIdToContinue: string, gateId: string) => {
      await continueRun(runIdToContinue, () => rejectAgentGate(runIdToContinue, gateId));
    },
    [continueRun]
  );

  const clearItems = useCallback(() => {
    eventStateRef.current = {
      runId: null,
      runState: null,
      executionState: null,
      blockingMode: null,
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
    setActiveGate(null);
    setPendingUiGates([]);
    setPendingContinuationRunId(null);
  }, []);

  const loadReattachableRun = useCallback(async (sessionId: string) => {
    const snapshot = await getReattachableAgentRun(sessionId);
    if (!snapshot) {
      return null;
    }

    applySnapshotToEventState(snapshot);
    setPendingContinuationRunId(getPendingContinuationRunIdFromSnapshot(snapshot));
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
    activeGate,
    pendingUiGates,
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
