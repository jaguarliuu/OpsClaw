import type { RefObject } from 'react';

import {
  buildSshTerminalContextMenuItems,
  type SshTerminalContextMenuAction,
  type SshTerminalContextMenuState,
} from '@/features/workbench/sshTerminalContextMenuModel';

type SshTerminalContextMenuProps = {
  contextMenuRef: RefObject<HTMLDivElement | null>;
  contextMenuState: SshTerminalContextMenuState;
  onCopySelection: () => void;
  onPasteFromClipboard: () => void;
  onRequestClose: () => void;
  onSelectAll: () => void;
};

export function SshTerminalContextMenu({
  contextMenuRef,
  contextMenuState,
  onCopySelection,
  onPasteFromClipboard,
  onRequestClose,
  onSelectAll,
}: SshTerminalContextMenuProps) {
  const items = buildSshTerminalContextMenuItems({
    canCopySelection: contextMenuState.canCopySelection,
  });

  const handleAction = (action: SshTerminalContextMenuAction) => {
    if (action === 'copy-selection') {
      onCopySelection();
    }
    if (action === 'paste-from-clipboard') {
      onPasteFromClipboard();
    }
    if (action === 'select-all') {
      onSelectAll();
    }
    onRequestClose();
  };

  return (
    <div
      className="fixed z-50 min-w-36 rounded-md border border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] p-1 shadow-[0_14px_40px_rgba(0,0,0,0.45)]"
      ref={contextMenuRef}
      style={{
        left: contextMenuState.x,
        top: contextMenuState.y,
      }}
    >
      {items.map((item) => (
        <button
          className={[
            'flex w-full items-center rounded px-3 py-2 text-left text-sm transition-colors',
            item.tone === 'default'
              ? 'text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-elevated3)] hover:text-[var(--app-text-primary)]'
              : 'cursor-not-allowed text-[var(--app-text-tertiary)] bg-transparent opacity-100',
          ].join(' ')}
          disabled={item.disabled}
          key={item.action}
          onClick={() => {
            handleAction(item.action);
          }}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
