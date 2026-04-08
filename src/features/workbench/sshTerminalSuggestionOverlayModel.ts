export type SshTerminalSuggestionOverlayPlacement = 'above' | 'below';

export type TerminalSuggestionItem = {
  id: string;
  label: string;
  detail: string;
  highlighted: boolean;
};

type ResolveSshTerminalSuggestionOverlayPositionOptions = {
  cursorRow: number;
  overlayHeight: number;
  totalRows: number;
  viewportHeight: number;
};

type SshTerminalSuggestionOverlayPosition = {
  placement: SshTerminalSuggestionOverlayPlacement;
  top: number;
};

const SSH_TERMINAL_SUGGESTION_OVERLAY_GAP_PX = 12;

export function resolveSshTerminalSuggestionOverlayPosition({
  cursorRow,
  overlayHeight,
  totalRows,
  viewportHeight,
}: ResolveSshTerminalSuggestionOverlayPositionOptions): SshTerminalSuggestionOverlayPosition {
  if (overlayHeight <= 0 || totalRows <= 0 || viewportHeight <= 0) {
    return {
      placement: 'below',
      top: SSH_TERMINAL_SUGGESTION_OVERLAY_GAP_PX,
    };
  }

  const clampedCursorRow = Math.min(Math.max(cursorRow, 0), totalRows - 1);
  const rowHeight = viewportHeight / totalRows;
  const rowTop = clampedCursorRow * rowHeight;
  const rowBottom = rowTop + rowHeight;
  const minTop = SSH_TERMINAL_SUGGESTION_OVERLAY_GAP_PX;
  const maxTop = Math.max(
    minTop,
    viewportHeight - overlayHeight - SSH_TERMINAL_SUGGESTION_OVERLAY_GAP_PX
  );
  const belowTop = rowBottom + SSH_TERMINAL_SUGGESTION_OVERLAY_GAP_PX;

  if (belowTop <= maxTop) {
    return {
      placement: 'below',
      top: Math.round(belowTop),
    };
  }

  return {
    placement: 'above',
    top: Math.round(Math.min(maxTop, Math.max(minTop, rowTop - overlayHeight - SSH_TERMINAL_SUGGESTION_OVERLAY_GAP_PX))),
  };
}
