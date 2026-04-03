import { forwardRef } from 'react';

import type { SshTerminalSuggestionOverlayPlacement } from '@/features/workbench/sshTerminalSuggestionOverlayModel';

type SshTerminalSuggestionOverlayProps = {
  placement: SshTerminalSuggestionOverlayPlacement;
  suggestion: string;
  top: number;
};

export const SshTerminalSuggestionOverlay = forwardRef<
  HTMLDivElement,
  SshTerminalSuggestionOverlayProps
>(function SshTerminalSuggestionOverlay({ placement, suggestion, top }, ref) {
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-4 z-20 max-w-[min(560px,calc(100%-32px))] rounded-lg border border-blue-500/30 bg-[#1e2025]/95 px-3 py-2 shadow-xl"
      data-placement={placement}
      style={{ top }}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="shrink-0 text-[11px] text-neutral-500">建议:</span>
        <span className="truncate font-mono text-[12px] text-neutral-300">{suggestion}</span>
        <span className="shrink-0 text-[10px] text-neutral-600">按 Tab 接受</span>
      </div>
    </div>
  );
});
