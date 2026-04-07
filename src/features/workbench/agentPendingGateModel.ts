import type { AgentStreamEvent, HumanGateRecord } from './types.agent';

export type PendingUiGateItem = {
  gateId: string;
  runId: string;
  sessionId: string;
  kind: 'approval' | 'parameter_confirmation';
  title: string;
  summary: string;
  openedAt: number;
};

const PENDING_GATE_KIND_ORDER: Record<PendingUiGateItem['kind'], number> = {
  approval: 0,
  parameter_confirmation: 1,
};

function sortPendingUiGateItems(items: PendingUiGateItem[]) {
  return [...items].sort((left, right) => {
    const kindOrder = PENDING_GATE_KIND_ORDER[left.kind] - PENDING_GATE_KIND_ORDER[right.kind];
    if (kindOrder !== 0) {
      return kindOrder;
    }

    if (left.openedAt !== right.openedAt) {
      return left.openedAt - right.openedAt;
    }

    return left.gateId.localeCompare(right.gateId);
  });
}

export function toPendingUiGateItem(gate: HumanGateRecord): PendingUiGateItem | null {
  if (gate.status !== 'open') {
    return null;
  }

  if (gate.presentationMode !== 'inline_ui_action') {
    return null;
  }

  if (gate.kind !== 'approval' && gate.kind !== 'parameter_confirmation') {
    return null;
  }

  return {
    gateId: gate.id,
    runId: gate.runId,
    sessionId: gate.sessionId,
    kind: gate.kind,
    title: gate.kind === 'approval' ? '待批准' : '待补全',
    summary: gate.reason,
    openedAt: gate.openedAt,
  };
}

export function buildPendingUiGateItems(gates: HumanGateRecord[]): PendingUiGateItem[] {
  return sortPendingUiGateItems(
    gates
      .map((gate) => toPendingUiGateItem(gate))
      .filter((item): item is PendingUiGateItem => item !== null)
  );
}

export function reducePendingUiGates(
  items: PendingUiGateItem[],
  event: AgentStreamEvent
): PendingUiGateItem[] {
  if (
    event.type !== 'human_gate_opened' &&
    event.type !== 'human_gate_resolved' &&
    event.type !== 'human_gate_rejected' &&
    event.type !== 'human_gate_expired'
  ) {
    return items;
  }

  const filtered = items.filter((item) => item.runId !== event.runId);
  if (event.type !== 'human_gate_opened') {
    return filtered;
  }

  const nextItem = toPendingUiGateItem(event.gate);
  if (!nextItem) {
    return filtered;
  }

  return sortPendingUiGateItems([...filtered, nextItem]);
}
