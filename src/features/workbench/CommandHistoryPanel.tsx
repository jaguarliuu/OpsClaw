import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, useCallback } from 'react';

import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { searchCommands, deleteCommand } from '@/features/workbench/api';
import type { CommandRecord } from '@/features/workbench/types';

type Props = {
  open: boolean;
  activeNodeId?: string;
  onClose: () => void;
  onExecute: (command: string) => void;
};

function formatRelative(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  if (h < 24) return `${h}小时前`;
  if (d < 30) return `${d}天前`;
  return `${Math.floor(d / 30)}个月前`;
}

export function CommandHistoryPanel({ open, activeNodeId, onClose, onExecute }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CommandRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [nodeOnly, setNodeOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (q: string, filterNode: boolean) => {
      void searchCommands(q, filterNode && activeNodeId ? activeNodeId : undefined).then((result) => {
        setItems(result);
        setActiveIndex(0);
      });
    },
    [activeNodeId]
  );

  // Load on open or filter toggle
  useEffect(() => {
    if (!open) return;
    load(query, nodeOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nodeOnly]);

  // Debounced search on query change
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load(query, nodeOnly);
    }, 300);
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, [query, open, load, nodeOnly]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteCommand(id);
    setItems((prev) => prev.filter((r) => r.id !== id));
    setActiveIndex((prev) => Math.min(prev, items.length - 2));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) {
        onExecute(item.command);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[15vh] z-50 w-[620px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-neutral-700 bg-[#1a1c22] shadow-2xl outline-none"
          onKeyDown={handleKeyDown}
        >
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-neutral-700/60 px-4 py-3">
            <svg
              className="h-4 w-4 shrink-0 text-neutral-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索历史命令..."
              className="min-w-0 flex-1 bg-transparent text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600"
            />
            {activeNodeId && (
              <button
                type="button"
                onClick={() => setNodeOnly((prev) => !prev)}
                className={cn(
                  'shrink-0 rounded px-2 py-1 text-[11px] transition-colors',
                  nodeOnly
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300'
                )}
              >
                当前节点
              </button>
            )}
          </div>

          {/* Results list */}
          <ul
            ref={listRef}
            className="max-h-[380px] overflow-y-auto py-1"
          >
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-neutral-600">
                {query ? '没有匹配的命令' : '暂无命令历史'}
              </li>
            ) : (
              items.map((item, index) => (
                <li
                  key={item.id}
                  className={cn(
                    'group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors',
                    index === activeIndex ? 'bg-neutral-700/50' : 'hover:bg-neutral-800/60'
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onExecute(item.command);
                    onClose();
                  }}
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-neutral-200">
                    {item.command}
                  </span>
                  <span className="shrink-0 text-[11px] text-neutral-600">
                    {formatRelative(item.lastUsed)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => void handleDelete(item.id, e)}
                    className="shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    title="删除"
                  >
                    ×
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* Footer hint */}
          <div className="border-t border-neutral-800 px-4 py-2 text-[11px] text-neutral-700">
            ↑↓ 选择 · Enter 执行 · Esc 关闭
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
