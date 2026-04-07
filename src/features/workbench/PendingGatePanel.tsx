import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ShieldAlert, SlidersHorizontal, X } from 'lucide-react';

import type { PendingUiGateItem } from './agentPendingGateModel';

type PendingGatePanelProps = {
  items: PendingUiGateItem[];
  open: boolean;
  onClose: () => void;
  onSelectRun: (runId: string) => void;
  onResolve: (runId: string, gateId: string, input?: { fields?: Record<string, string> }) => Promise<void>;
  onReject: (runId: string, gateId: string) => Promise<void>;
};

function getPendingGateIcon(kind: PendingUiGateItem['kind']) {
  if (kind === 'approval') {
    return <ShieldAlert className="h-4 w-4 text-amber-300" />;
  }

  return <SlidersHorizontal className="h-4 w-4 text-sky-300" />;
}

export function PendingGatePanel({
  items,
  open,
  onClose,
  onSelectRun,
  onResolve,
  onReject,
}: PendingGatePanelProps) {
  const [selectedGateId, setSelectedGateId] = useState<string | null>(items[0]?.gateId ?? null);
  const [busyGateId, setBusyGateId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (items.length === 0) {
      setSelectedGateId(null);
      return;
    }

    if (!selectedGateId || !items.some((item) => item.gateId === selectedGateId)) {
      setSelectedGateId(items[0]?.gateId ?? null);
    }
  }, [items, open, selectedGateId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.gateId === selectedGateId) ?? items[0] ?? null,
    [items, selectedGateId]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[min(720px,100vw)] border-l border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] shadow-2xl">
      <div className="flex w-[280px] flex-col border-r border-[var(--app-border-default)]">
        <div className="flex items-center justify-between border-b border-[var(--app-border-default)] px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Pending HITL</div>
            <div className="mt-1 text-sm font-semibold text-[var(--app-text-primary)]">待处理确认项</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-[var(--app-bg-elevated3)] hover:text-[var(--app-text-primary)]"
            title="关闭待处理面板"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--app-border-default)] px-4 py-6 text-sm text-neutral-500">
              当前没有待处理的人机确认项。
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const isSelected = item.gateId === selectedItem?.gateId;
                return (
                  <button
                    key={item.gateId}
                    type="button"
                    onClick={() => {
                      setSelectedGateId(item.gateId);
                    }}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : 'border-[var(--app-border-default)] bg-[var(--app-bg-elevated3)] hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--app-text-primary)]">
                      {getPendingGateIcon(item.kind)}
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
            <div className="border-b border-[var(--app-border-default)] px-5 py-4">
              <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Detail</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-[var(--app-text-primary)]">
                {getPendingGateIcon(selectedItem.kind)}
                <span>{selectedItem.title}</span>
              </div>
              <div className="mt-2 text-sm text-neutral-400">{selectedItem.summary}</div>
            </div>

            <div className="flex-1 space-y-4 px-5 py-5">
              <div className="rounded-xl border border-[var(--app-border-default)] bg-[var(--app-bg-elevated3)] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Context</div>
                <div className="mt-3 space-y-2 text-sm text-[var(--app-text-primary)]">
                  <div>类型：{selectedItem.kind === 'approval' ? '敏感操作批准' : '参数确认'}</div>
                  <div>Run：{selectedItem.runId}</div>
                  <div>Session：{selectedItem.sessionId}</div>
                </div>
              </div>

              {selectedItem.kind === 'parameter_confirmation' ? (
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm text-sky-100">
                  参数补全会在后续 AI 面板卡片中提供完整表单。这里先支持快速定位和拒绝。
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border-default)] px-5 py-4">
                <button
                  type="button"
                  onClick={() => onSelectRun(selectedItem.runId)}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--app-border-default)] px-3 py-2 text-sm text-[var(--app-text-primary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
                >
                  <ArrowRight className="h-4 w-4" />
                  在 AI 面板中处理
                </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busyGateId === selectedItem.gateId}
                  onClick={() => {
                    setBusyGateId(selectedItem.gateId);
                    void onReject(selectedItem.runId, selectedItem.gateId).finally(() => {
                      setBusyGateId((current) => (current === selectedItem.gateId ? null : current));
                    });
                  }}
                  className="rounded-md border border-rose-500/30 px-3 py-2 text-sm text-rose-200 transition-colors hover:bg-rose-500/10 disabled:opacity-60"
                >
                  拒绝
                </button>

                {selectedItem.kind === 'approval' ? (
                  <button
                    type="button"
                    disabled={busyGateId === selectedItem.gateId}
                    onClick={() => {
                      setBusyGateId(selectedItem.gateId);
                      void onResolve(selectedItem.runId, selectedItem.gateId).finally(() => {
                        setBusyGateId((current) => (current === selectedItem.gateId ? null : current));
                      });
                    }}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                  >
                    批准并继续
                  </button>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-neutral-500">
            选择一条待处理项查看详情。
          </div>
        )}
      </div>
    </div>
  );
}
