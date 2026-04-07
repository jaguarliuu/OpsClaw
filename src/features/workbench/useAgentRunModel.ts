import type {
  AgentRunBlockingMode,
  AgentRunExecutionState,
  AgentRunSnapshot,
  AgentRunState,
  AgentStreamEvent,
  AgentTimelineItem,
  HumanGateRecord,
} from './types.agent';
import type { PendingUiGateItem } from './agentPendingGateModel';
import { buildPendingUiGateItems, reducePendingUiGates } from './agentPendingGateModel';

export type AgentEventState = {
  runId: string | null;
  runState: AgentRunState | null;
  executionState: AgentRunExecutionState | null;
  blockingMode: AgentRunBlockingMode | null;
  activeGate: HumanGateRecord | null;
  pendingUiGates: PendingUiGateItem[];
  error: string | null;
};

function findLastAssistantItemIndex(items: AgentTimelineItem[], step: number) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind === 'assistant' && item.step === step) {
      return index;
    }
  }

  return -1;
}

function upsertAssistantTimelineItem(
  items: AgentTimelineItem[],
  step: number,
  updateText: (currentText: string | null) => string,
  itemId: string
): AgentTimelineItem[] {
  const targetIndex = findLastAssistantItemIndex(items, step);

  if (targetIndex === -1) {
    return [
      ...items,
      {
        id: itemId,
        kind: 'assistant',
        step,
        text: updateText(null),
      },
    ];
  }

  return items.map((item, index) => {
    if (index !== targetIndex || item.kind !== 'assistant') {
      return item;
    }

    return {
      ...item,
      text: updateText(item.text),
    };
  });
}

export function mapAgentEventToTimelineItem(
  event: AgentStreamEvent,
  itemId: string
): AgentTimelineItem | null {
  if (event.type === 'assistant_message_delta') {
    return {
      id: itemId,
      kind: 'assistant',
      text: event.delta,
      step: event.step,
    };
  }

  if (event.type === 'assistant_message') {
    return {
      id: itemId,
      kind: 'assistant',
      text: event.text,
      step: event.step,
    };
  }

  if (event.type === 'tool_call') {
    return {
      id: itemId,
      kind: 'tool_call',
      step: event.step,
      toolName: event.toolName,
      arguments: event.arguments,
    };
  }

  if (event.type === 'tool_execution_finished') {
    return {
      id: itemId,
      kind: 'tool_result',
      step: event.step,
      toolName: event.toolName,
      result: event.result,
    };
  }

  if (event.type === 'approval_required') {
    return {
      id: itemId,
      kind: 'warning',
      text: `工具 ${event.toolName} 需要审批：${event.reason}`,
      step: event.step,
      policy: event.policy,
    };
  }

  if (event.type === 'warning') {
    return {
      id: itemId,
      kind: 'warning',
      text: event.message,
      step: event.step,
    };
  }

  if (
    event.type === 'human_gate_opened' ||
    event.type === 'human_gate_resolved' ||
    event.type === 'human_gate_rejected' ||
    event.type === 'human_gate_expired'
  ) {
    return {
      id: itemId,
      kind: 'human_gate',
      runId: event.runId,
      gate: event.gate,
    };
  }

  if (event.type === 'run_completed') {
    return {
      id: itemId,
      kind: 'final',
      text: event.finalAnswer,
      steps: event.steps,
    };
  }

  if (event.type === 'run_failed') {
    return {
      id: itemId,
      kind: 'status',
      text: `执行失败：${event.error}`,
    };
  }

  if (event.type === 'run_cancelled') {
    return {
      id: itemId,
      kind: 'status',
      text: 'Agent 已停止。',
    };
  }

  return null;
}

export function applyAgentEventToTimeline(
  items: AgentTimelineItem[],
  event: AgentStreamEvent,
  createItemId: () => string
): AgentTimelineItem[] {
  if (event.type === 'assistant_message_delta') {
    return upsertAssistantTimelineItem(
      items,
      event.step,
      (currentText) => `${currentText ?? ''}${event.delta}`,
      createItemId()
    );
  }

  if (event.type === 'assistant_message') {
    return upsertAssistantTimelineItem(
      items,
      event.step,
      () => event.text,
      createItemId()
    );
  }

  const timelineItem = mapAgentEventToTimelineItem(event, createItemId());
  return timelineItem ? [...items, timelineItem] : items;
}

export function reduceAgentEventState(
  state: AgentEventState,
  event: AgentStreamEvent
): AgentEventState {
  if (event.type === 'run_started') {
    return {
      ...state,
      runId: event.runId,
      error: null,
    };
  }

  if (event.type === 'run_state_changed') {
    return {
      ...state,
      runId: event.runId,
      runState: event.state,
      executionState: event.executionState ?? state.executionState,
      blockingMode: event.blockingMode ?? state.blockingMode,
    };
  }

  if (event.type === 'human_gate_opened' || event.type === 'human_gate_expired') {
    return {
      ...state,
      runId: event.runId,
      activeGate: event.gate,
      pendingUiGates: reducePendingUiGates(state.pendingUiGates, event),
    };
  }

  if (event.type === 'human_gate_resolved' || event.type === 'human_gate_rejected') {
    return {
      ...state,
      runId: event.runId,
      activeGate: null,
      pendingUiGates: reducePendingUiGates(state.pendingUiGates, event),
    };
  }

  if (event.type === 'run_completed') {
    return {
      ...state,
      runId: event.runId,
      runState: 'completed',
      executionState: 'completed',
      blockingMode: 'none',
      activeGate: null,
      pendingUiGates: [],
      error: null,
    };
  }

  if (event.type === 'run_failed') {
    return {
      ...state,
      runId: event.runId,
      runState: 'failed',
      executionState: 'failed',
      blockingMode: 'none',
      activeGate: null,
      pendingUiGates: [],
      error: event.error,
    };
  }

  if (event.type === 'run_cancelled') {
    return {
      ...state,
      runId: event.runId,
      runState: 'cancelled',
      executionState: 'cancelled',
      blockingMode: 'none',
      activeGate: null,
      pendingUiGates: [],
    };
  }

  return state;
}

export function projectAgentSnapshotToEventState(
  state: AgentEventState,
  snapshot: AgentRunSnapshot
): AgentEventState {
  return {
    ...state,
    runId: snapshot.runId,
    runState: snapshot.state,
    executionState: snapshot.executionState,
    blockingMode: snapshot.blockingMode,
    activeGate: snapshot.openGate,
    pendingUiGates: snapshot.openGate ? buildPendingUiGateItems([snapshot.openGate]) : [],
    error: null,
  };
}
