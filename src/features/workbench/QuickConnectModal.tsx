import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';

import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import type { SavedConnectionProfile } from './types';

type Props = {
  open: boolean;
  profiles: SavedConnectionProfile[];
  onClose: () => void;
  onConnect: (profile: SavedConnectionProfile) => void;
};

function filterProfiles(profiles: SavedConnectionProfile[], query: string) {
  const q = query.toLowerCase().trim();
  if (!q) return profiles;
  return profiles.filter((p) =>
    [p.name, p.host, p.username, p.group].join(' ').toLowerCase().includes(q)
  );
}

export function QuickConnectModal({ open, profiles, onClose, onConnect }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = filterProfiles(profiles, query);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Reset selection to top when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const profile = filtered[selectedIndex];
        if (profile) {
          onConnect(profile);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selectedIndex, onConnect, onClose]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[18%] z-50 w-[min(540px,calc(100vw-24px))]
                     -translate-x-1/2 rounded-xl border border-neutral-700
                     bg-[#1c1e22] shadow-2xl outline-none"
          onEscapeKeyDown={onClose}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
            <svg
              className="h-4 w-4 shrink-0 text-neutral-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-[13px] text-neutral-100
                         placeholder:text-neutral-500 outline-none"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索主机 — 名称、IP、用户名、分组..."
              type="text"
              value={query}
            />
            <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-500">
              esc
            </kbd>
          </div>

          {/* Results list */}
          <div className="max-h-[360px] overflow-auto py-1.5">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-500">
                没有匹配的主机
              </div>
            ) : (
              filtered.map((profile, index) => (
                <button
                  key={profile.id}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                    index === selectedIndex ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'
                  )}
                  onClick={() => {
                    onConnect(profile);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-neutral-100">
                      {profile.name}
                    </div>
                    <div className="truncate text-[12px] text-neutral-400">
                      {profile.username}@{profile.host}:{profile.port}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400">
                    {profile.group}
                  </span>
                </button>
              ))
            )}
          </div>

          {filtered.length > 0 && (
            <div className="border-t border-neutral-800 px-4 py-2 text-[11px] text-neutral-600">
              ↑↓ 导航 &nbsp;·&nbsp; ↵ 连接 &nbsp;·&nbsp; esc 关闭
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
