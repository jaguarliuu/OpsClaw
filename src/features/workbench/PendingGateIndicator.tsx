import { BellRing } from 'lucide-react';

import { formatPendingGateIndicatorLabel, getPendingGateIndicatorVisible } from './workbenchShellModel';

type PendingGateIndicatorProps = {
  count: number;
  onClick: () => void;
};

export function PendingGateIndicator({ count, onClick }: PendingGateIndicatorProps) {
  if (!getPendingGateIndicatorVisible(count)) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
      title="查看待处理的人机确认项"
    >
      <BellRing className="h-3.5 w-3.5" />
      <span>待处理</span>
      <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-950">
        {formatPendingGateIndicatorLabel(count)}
      </span>
    </button>
  );
}
