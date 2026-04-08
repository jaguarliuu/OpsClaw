import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ShieldAlert,
  ShieldQuestion,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import type { PendingInteractionItem } from './agentInteractionModel';
import { InteractionCard } from './InteractionCard';

type PendingInteractionPanelProps = {
  items: PendingInteractionItem[];
  open: boolean;
  onClose: () => void;
  onSelectRun: (runId: string) => void;
  onSubmitInteraction: (
    runId: string,
    requestId: string,
    actionId: string,
    payload: Record<string, unknown>
  ) => Promise<void>;
};

function getPendingInteractionIcon(kind: PendingInteractionItem['interactionKind']) {
  if (kind === 'approval') {
    return <ShieldAlert className="h-4 w-4 text-amber-300" />;
  }

  if (kind === 'danger_confirm') {
    return <ShieldQuestion className="h-4 w-4 text-red-300" />;
  }

  return <SlidersHorizontal className="h-4 w-4 text-sky-300" />;
}

export function PendingInteractionPanel({
  items,
  open,
  onClose,
  onSelectRun,
  onSubmitInteraction,
}: PendingInteractionPanelProps) {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(items[0]?.requestId ?? null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (items.length === 0) {
      setSelectedRequestId(null);
      return;
    }

    if (!selectedRequestId || !items.some((item) => item.requestId === selectedRequestId)) {
      setSelectedRequestId(items[0]?.requestId ?? null);
    }
  }, [items, open, selectedRequestId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.requestId === selectedRequestId) ?? items[0] ?? null,
    [items, selectedRequestId]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[min(760px,100vw)] border-l border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] shadow-2xl">
      <div className="flex w-[300px] flex-col border-r border-[var(--app-border-default)]">
        <div className="flex items-center justify-between border-b border-[var(--app-border-default)] px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Pending Interactions</div>
            <div className="mt-1 text-sm font-semibold text-[var(--app-text-primary)]">待处理交互</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-[var(--app-bg-elevated3)] hover:text-[var(--app-text-primary)]"
            title="关闭待处理交互面板"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--app-border-default)] px-4 py-6 text-sm text-neutral-500">
              当前没有待处理的交互项。
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const isSelected = item.requestId === selectedItem?.requestId;
                return (
                  <button
                    key={item.requestId}
                    type="button"
                    onClick={() => setSelectedRequestId(item.requestId)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : 'border-[var(--app-border-default)] bg-[var(--app-bg-elevated3)] hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--app-text-primary)]">
                      {getPendingInteractionIcon(item.interactionKind)}
                      <span>{item.title}</span>
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs text-neutral-400">{item.summary}</div>
                    <div className="mt-3 text-[11px] text-neutral-500">Run {item.runId}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {selectedItem ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--app-border-default)] px-5 py-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Detail</div>
                <div className="mt-1 text-sm text-neutral-400">
                  Session {selectedItem.sessionId} · Run {selectedItem.runId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectRun(selectedItem.runId)}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--app-border-default)] px-3 py-2 text-sm text-[var(--app-text-primary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
              >
                <ArrowRight className="h-4 w-4" />
                在 AI 面板中处理
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <InteractionCard
                request={selectedItem.request}
                disabled={busyRequestId === selectedItem.requestId}
                onSubmit={async (actionId, payload) => {
                  setBusyRequestId(selectedItem.requestId);
                  try {
                    await onSubmitInteraction(
                      selectedItem.runId,
                      selectedItem.requestId,
                      actionId,
                      payload
                    );
                  } finally {
                    setBusyRequestId((current) =>
                      current === selectedItem.requestId ? null : current
                    );
                  }
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-neutral-500">
            选择一条待处理交互查看详情。
          </div>
        )}
      </div>
    </div>
  );
}

export const PendingGatePanel = PendingInteractionPanel;
