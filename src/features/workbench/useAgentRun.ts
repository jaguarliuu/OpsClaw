import { useCallback, useRef, useState } from 'react';

import {
  rejectAgentGate,
  resolveAgentGate,
  resumeAgentGate,
  streamAgentRun,
  streamAgentRunContinuation,
} from './agentApi';
import type {
  AgentRunState,
  AgentStreamEvent,
  AgentTimelineItem,
  HumanGateRecord,
} from './types.agent';
import { applyAgentEventToTimeline } from './useAgentRunModel';

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
  const [activeGate, setActiveGate] = useState<HumanGateRecord | null>(null);
  const [pendingContinuationRunId, setPendingContinuationRunId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const appendItem = useCallback((item: AgentTimelineItem) => {
    setItems((current) => [...current, item]);
  }, []);

  const handleEvent = useCallback(
    (event: AgentStreamEvent) => {
      if (event.type === 'run_started') {
        setRunId(event.runId);
        setPendingContinuationRunId(null);
        return;
      }

      if (event.type === 'run_state_changed') {
        setRunState(event.state);
      }

      if (event.type === 'human_gate_opened' || event.type === 'human_gate_expired') {
        setActiveGate(event.gate);
      }

      if (event.type === 'human_gate_resolved' || event.type === 'human_gate_rejected') {
        setActiveGate(null);
      }

      setItems((current): AgentTimelineItem[] =>
        applyAgentEventToTimeline(current, event, createItemId)
      );

      if (event.type === 'run_completed') {
        setRunState('completed');
        setActiveGate(null);
        setPendingContinuationRunId(null);
        setIsRunning(false);
        return;
      }

      if (event.type === 'run_failed') {
        setRunState('failed');
        setActiveGate(null);
        setPendingContinuationRunId(null);
        setError(event.error);
        setIsRunning(false);
        return;
      }

      if (event.type === 'run_cancelled') {
        setRunState('cancelled');
        setActiveGate(null);
        setPendingContinuationRunId(null);
        setIsRunning(false);
      }
    },
    []
  );

  const continueRun = useCallback(
    async (
      runIdToContinue: string,
      action: () => Promise<{
        state: AgentRunState;
        openGate: HumanGateRecord | null;
      }>
    ) => {
      const controller = new AbortController();
      let actionApplied = false;
      abortControllerRef.current = controller;
      setError(null);
      setIsRunning(true);

      try {
        const snapshot = await action();
        actionApplied = true;
        setRunState(snapshot.state);
        setActiveGate(snapshot.openGate);
        setPendingContinuationRunId(runIdToContinue);

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
          if (!actionApplied) {
            setPendingContinuationRunId(null);
          }
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
        if (!actionApplied) {
          setPendingContinuationRunId(null);
        }
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
      setIsRunning(true);
      setRunId(null);
      setRunState('running');
      setActiveGate(null);
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
    async (runIdToContinue: string, gateId: string) => {
      await continueRun(runIdToContinue, () => resolveAgentGate(runIdToContinue, gateId));
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
    setItems([]);
    setError(null);
    setRunId(null);
    setRunState(null);
    setActiveGate(null);
    setPendingContinuationRunId(null);
  }, []);

  return {
    items,
    isRunning,
    error,
    runId,
    runState,
    activeGate,
    pendingContinuationRunId,
    runAgent,
    stopAgent,
    approveGate,
    rejectGate,
    resumeGate,
    continuePendingRun,
    clearItems,
  };
}
