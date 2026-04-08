import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

import type {
  SshTerminalSuggestionOverlayPlacement,
  TerminalSuggestionItem,
} from '@/features/workbench/sshTerminalSuggestionOverlayModel';

type SshTerminalSuggestionOverlayProps = {
  hint?: string;
  placement: SshTerminalSuggestionOverlayPlacement;
  items: TerminalSuggestionItem[];
  title: string;
  top: number;
};

export const SshTerminalSuggestionOverlay = forwardRef<
  HTMLDivElement,
  SshTerminalSuggestionOverlayProps
>(function SshTerminalSuggestionOverlay({ hint, placement, items, title, top }, ref) {
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-4 z-20 max-w-[min(560px,calc(100%-32px))] rounded-lg border border-blue-500/30 bg-[#1e2025]/95 px-3 py-2 shadow-xl"
      data-placement={placement}
      style={{ top }}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <span>{title}</span>
          {hint ? <span>{hint}</span> : null}
        </div>
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3 rounded-md px-2 py-1.5 text-[12px]',
              item.highlighted ? 'bg-blue-500/15 text-neutral-100' : 'text-neutral-300'
            )}
          >
            <span className="truncate font-mono text-blue-300">{item.label}</span>
            <span className="truncate text-neutral-400">{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
