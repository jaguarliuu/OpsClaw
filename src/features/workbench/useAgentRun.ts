import { useCallback, useRef, useState } from 'react';

import { streamAgentRun } from './agentApi';
import type { AgentStreamEvent, AgentTimelineItem } from './types.agent';

type RunAgentOptions = {
  providerId: string;
  model: string;
  maxSteps?: number;
  task: string;
  sessionId: string;
};

function createItemId() {
  return crypto.randomUUID();
}

export function useAgentRun() {
  const [items, setItems] = useState<AgentTimelineItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const appendItem = useCallback((item: AgentTimelineItem) => {
    setItems((current) => [...current, item]);
  }, []);

  const handleEvent = useCallback(
    (event: AgentStreamEvent) => {
      if (event.type === 'run_started') {
        setRunId(event.runId);
        return;
      }

      if (event.type === 'assistant_message') {
        appendItem({
          id: createItemId(),
          kind: 'assistant',
          text: event.text,
          step: event.step,
        });
        return;
      }

      if (event.type === 'tool_call') {
        appendItem({
          id: createItemId(),
          kind: 'tool_call',
          step: event.step,
          toolName: event.toolName,
          arguments: event.arguments,
        });
        return;
      }

      if (event.type === 'tool_execution_finished') {
        appendItem({
          id: createItemId(),
          kind: 'tool_result',
          step: event.step,
          toolName: event.toolName,
          result: event.result,
        });
        return;
      }

      if (event.type === 'approval_required') {
        appendItem({
          id: createItemId(),
          kind: 'warning',
          text: `工具 ${event.toolName} 需要审批：${event.reason}`,
          step: event.step,
        });
        return;
      }

      if (event.type === 'warning') {
        appendItem({
          id: createItemId(),
          kind: 'warning',
          text: event.message,
          step: event.step,
        });
        return;
      }

      if (event.type === 'run_completed') {
        appendItem({
          id: createItemId(),
          kind: 'final',
          text: event.finalAnswer,
          steps: event.steps,
        });
        setIsRunning(false);
        return;
      }

      if (event.type === 'run_failed') {
        setError(event.error);
        appendItem({
          id: createItemId(),
          kind: 'status',
          text: `执行失败：${event.error}`,
        });
        setIsRunning(false);
        return;
      }

      if (event.type === 'run_cancelled') {
        appendItem({
          id: createItemId(),
          kind: 'status',
          text: 'Agent 已停止。',
        });
        setIsRunning(false);
      }
    },
    [appendItem]
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

  const clearItems = useCallback(() => {
    setItems([]);
    setError(null);
    setRunId(null);
  }, []);

  return {
    items,
    isRunning,
    error,
    runId,
    runAgent,
    stopAgent,
    clearItems,
  };
}
