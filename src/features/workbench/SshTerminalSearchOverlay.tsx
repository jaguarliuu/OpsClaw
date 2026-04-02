import type { RefObject } from 'react';

type SshTerminalSearchOverlayProps = {
  onCloseSearch: () => void;
  onFindNext: () => void;
  onFindPrev: () => void;
  onSearchQueryChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
};

export function SshTerminalSearchOverlay({
  onCloseSearch,
  onFindNext,
  onFindPrev,
  onSearchQueryChange,
  searchInputRef,
  searchQuery,
}: SshTerminalSearchOverlayProps) {
  return (
    <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-lg border border-[var(--app-border-strong)] bg-[#1e2025] px-2 py-1.5 shadow-xl">
      <input
        ref={searchInputRef}
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (event.shiftKey) {
              onFindPrev();
            } else {
              onFindNext();
            }
          }

          if (event.key === 'Escape') {
            onCloseSearch();
          }
        }}
        placeholder="搜索..."
        className="w-44 bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-600"
      />
      <button
        type="button"
        onClick={onFindPrev}
        title="上一个 (Shift+Enter)"
        className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onFindNext}
        title="下一个 (Enter)"
        className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onCloseSearch}
        title="关闭 (Esc)"
        className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
      >
        ×
      </button>
    </div>
  );
}
