import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { SshTerminalPane, type SshTerminalPaneHandle } from '@/features/workbench/SshTerminalPane';
import type { ConnectionStatus, LiveSession } from '@/features/workbench/types';
import { cn } from '@/lib/utils';

type SplitLayout = 'single' | 'horizontal' | 'vertical';

export type TerminalWorkspaceHandle = {
  sendCommandToActive: (command: string) => void;
};

type TerminalWorkspaceProps = {
  activeSessionId: string | null;
  canOpenConnectionConfig: boolean;
  sessions: LiveSession[];
  sidebarCollapsed: boolean;
  onCloseSession: (sessionId: string) => void;
  onOpenConnectionConfig: () => void;
  onOpenNewConnection: () => void;
  onToggleSidebar: () => void;
  onSelectSession: (sessionId: string) => void;
  onSessionStatusChange: (sessionId: string, status: ConnectionStatus, errorMessage?: string) => void;
};

function SingleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function SplitHorizontalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="8" y1="2" x2="8" y2="14" />
    </svg>
  );
}

function SplitVerticalIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="2" y1="8" x2="14" y2="8" />
    </svg>
  );
}

export const TerminalWorkspace = forwardRef<TerminalWorkspaceHandle, TerminalWorkspaceProps>(
  function TerminalWorkspace({
  activeSessionId,
  canOpenConnectionConfig,
  sessions,
  sidebarCollapsed,
  onCloseSession,
  onOpenConnectionConfig,
  onOpenNewConnection,
  onToggleSidebar,
  onSelectSession,
  onSessionStatusChange,
}: TerminalWorkspaceProps, ref: React.Ref<TerminalWorkspaceHandle>) {
  const terminalRefs = useRef<Record<string, SshTerminalPaneHandle | null>>({});

  useImperativeHandle(ref, () => ({
    sendCommandToActive(command: string) {
      if (!activeSessionId) return;
      terminalRefs.current[activeSessionId]?.sendCommand(command);
    },
  }), [activeSessionId]);

  const [splitLayout, setSplitLayout] = useState<SplitLayout>('single');
  const [paneSessionIds, setPaneSessionIds] = useState<[string | null, string | null]>([null, null]);
  const [focusedPane, setFocusedPane] = useState<0 | 1>(0);
  const [splitRatio, setSplitRatio] = useState(0.5);

  const focusedPaneRef = useRef<0 | 1>(0);
  const splitLayoutRef = useRef<SplitLayout>('single');
  const isDraggingRef = useRef(false);
  const dragRafRef = useRef<number | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    focusedPaneRef.current = focusedPane;
  }, [focusedPane]);

  useEffect(() => {
    splitLayoutRef.current = splitLayout;
  }, [splitLayout]);

  // Assign activeSessionId to the focused pane when in split mode
  useEffect(() => {
    if (splitLayoutRef.current === 'single' || !activeSessionId) return;
    setPaneSessionIds((prev) => {
      const next: [string | null, string | null] = [...prev] as [string | null, string | null];
      next[focusedPaneRef.current] = activeSessionId;
      return next;
    });
  }, [activeSessionId]);

  // Clean up paneSessionIds when sessions are closed
  useEffect(() => {
    const ids = new Set(sessions.map((s) => s.id));
    setPaneSessionIds((prev) => {
      const next: [string | null, string | null] = [
        prev[0] && ids.has(prev[0]) ? prev[0] : null,
        prev[1] && ids.has(prev[1]) ? prev[1] : null,
      ];
      return next[0] === prev[0] && next[1] === prev[1] ? prev : next;
    });
  }, [sessions]);

  const enterSplitMode = (layout: 'horizontal' | 'vertical') => {
    setSplitLayout(layout);
    splitLayoutRef.current = layout;
    const other = sessions.find((s) => s.id !== activeSessionId);
    setPaneSessionIds([activeSessionId, other?.id ?? null]);
    setFocusedPane(0);
    focusedPaneRef.current = 0;
  };

  const exitSplitMode = () => {
    const target = paneSessionIds[focusedPaneRef.current] ?? activeSessionId;
    setSplitLayout('single');
    splitLayoutRef.current = 'single';
    if (target) onSelectSession(target);
  };

  const handlePaneFocus = (paneIndex: 0 | 1) => {
    const sid = paneSessionIds[paneIndex];
    setFocusedPane(paneIndex);
    focusedPaneRef.current = paneIndex;
    if (sid) onSelectSession(sid);
  };

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const layout = splitLayoutRef.current;
    const startPos = layout === 'horizontal' ? e.clientX : e.clientY;
    const startRatio = splitRatio;
    const containerEl = splitContainerRef.current;
    if (!containerEl) return;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || dragRafRef.current !== null) return;
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        const containerSize =
          layout === 'horizontal' ? containerEl.offsetWidth : containerEl.offsetHeight;
        const delta =
          ((layout === 'horizontal' ? ev.clientX : ev.clientY) - startPos) / containerSize;
        setSplitRatio(Math.max(0.15, Math.min(0.85, startRatio + delta)));
      });
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const activeSession = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null;

  const getPaneStyle = (paneIndex: 0 | 1): React.CSSProperties => {
    if (splitLayout === 'horizontal') {
      return paneIndex === 0
        ? { position: 'absolute', top: 0, bottom: 0, left: 0, right: `calc(${(1 - splitRatio) * 100}% + 2px)` }
        : { position: 'absolute', top: 0, bottom: 0, right: 0, left: `calc(${splitRatio * 100}% + 2px)` };
    }
    return paneIndex === 0
      ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: `calc(${(1 - splitRatio) * 100}% + 2px)` }
      : { position: 'absolute', bottom: 0, left: 0, right: 0, top: `calc(${splitRatio * 100}% + 2px)` };
  };

  const getDividerStyle = (): React.CSSProperties => {
    if (splitLayout === 'horizontal') {
      return {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `calc(${splitRatio * 100}% - 2px)`,
        width: '4px',
      };
    }
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: `calc(${splitRatio * 100}% - 2px)`,
      height: '4px',
    };
  };

  return (
    <section className="grid min-h-screen min-w-0 flex-1 grid-rows-[42px_38px_minmax(0,1fr)] bg-[#181a1e]">
      <header className="flex items-stretch justify-between border-b border-neutral-800 bg-[#17181b] px-2">
        <div className="flex min-w-0 items-stretch gap-1 overflow-auto">
          {sidebarCollapsed ? (
            <Button
              aria-label="展开连接管理器"
              className="mt-1 min-w-8 px-0 text-base text-neutral-400"
              onClick={onToggleSidebar}
              size="sm"
              variant="ghost"
            >
              ≡
            </Button>
          ) : null}
          {sessions.map((session, index) => (
            <button
              className={cn(
                'inline-flex max-w-64 items-center gap-2 rounded-t-md border border-transparent border-b-0 bg-[#23262b] px-3 text-[13px] text-neutral-400',
                session.id === activeSessionId && 'bg-[#2a2d32] text-neutral-100'
              )}
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              type="button"
            >
              <span className="text-[12px] text-neutral-500">{index + 1}</span>
              <span className="truncate">{session.username}@{session.host}</span>
              <span
                className="text-neutral-500 transition-colors hover:text-neutral-200"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseSession(session.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onCloseSession(session.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                ×
              </span>
            </button>
          ))}
          <Button
            aria-label="新建连接"
            className="mt-1 min-w-8 px-0 text-base text-neutral-400"
            onClick={onOpenNewConnection}
            size="sm"
            variant="ghost"
          >
            +
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center">
            <button
              type="button"
              title="单屏"
              onClick={exitSplitMode}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-neutral-700',
                splitLayout === 'single' ? 'text-blue-400' : 'text-neutral-500'
              )}
            >
              <SingleIcon />
            </button>
            <button
              type="button"
              title="左右分屏"
              onClick={() => enterSplitMode('horizontal')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-neutral-700',
                splitLayout === 'horizontal' ? 'text-blue-400' : 'text-neutral-500'
              )}
            >
              <SplitHorizontalIcon />
            </button>
            <button
              type="button"
              title="上下分屏"
              onClick={() => enterSplitMode('vertical')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-neutral-700',
                splitLayout === 'vertical' ? 'text-blue-400' : 'text-neutral-500'
              )}
            >
              <SplitVerticalIcon />
            </button>
          </div>

          <Button
            className="text-neutral-400 disabled:text-neutral-700"
            disabled={!canOpenConnectionConfig}
            onClick={onOpenConnectionConfig}
            size="sm"
            variant="ghost"
          >
            配置
          </Button>
        </div>
      </header>

      <div className="flex items-center justify-end border-b border-neutral-900 bg-[#17191d] px-4 text-sm text-neutral-500">
        <div className="flex items-center gap-2">
          {activeSession ? (
            <>
              <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs">
                {activeSession.username}
              </span>
              <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs">
                {activeSession.host}
              </span>
              <span
                className={cn(
                  'rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs',
                  activeSession.status === 'connected' && 'text-emerald-400'
                )}
              >
                {activeSession.status}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="relative min-h-0 bg-[#121315]" ref={splitContainerRef}>
        {sessions.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="flex items-center gap-3">
              {sidebarCollapsed ? (
                <Button onClick={onToggleSidebar} variant="secondary">
                  展开连接列表
                </Button>
              ) : null}
              <Button onClick={onOpenNewConnection}>新建连接</Button>
            </div>
          </div>
        ) : (
          <>
            {sessions.map((session) => {
              const paneIndex = paneSessionIds.indexOf(session.id) as 0 | 1 | -1;
              const isInPane = splitLayout !== 'single' && paneIndex !== -1;
              const isFocusedPane = isInPane && paneIndex === focusedPane;

              if (splitLayout === 'single') {
                return (
                  <SshTerminalPane
                    active={session.id === activeSessionId}
                    key={session.id}
                    onStatusChange={onSessionStatusChange}
                    ref={(handle) => {
                      terminalRefs.current[session.id] = handle;
                    }}
                    session={session}
                  />
                );
              }

              if (!isInPane) {
                return (
                  <SshTerminalPane
                    active={false}
                    key={session.id}
                    onStatusChange={onSessionStatusChange}
                    ref={(handle) => {
                      terminalRefs.current[session.id] = handle;
                    }}
                    session={session}
                  />
                );
              }

              return (
                <div
                  key={session.id}
                  style={getPaneStyle(paneIndex as 0 | 1)}
                  className={cn(
                    isFocusedPane
                      ? 'ring-1 ring-inset ring-blue-500/25'
                      : 'ring-1 ring-inset ring-neutral-800/60'
                  )}
                  onPointerDown={() => {
                    if (!isFocusedPane) handlePaneFocus(paneIndex as 0 | 1);
                  }}
                >
                  <SshTerminalPane
                    active={isFocusedPane}
                    show={true}
                    onStatusChange={onSessionStatusChange}
                    ref={(handle) => {
                      terminalRefs.current[session.id] = handle;
                    }}
                    session={session}
                  />
                </div>
              );
            })}

            {splitLayout !== 'single' &&
              ([0, 1] as const).map((paneIndex) => {
                if (paneSessionIds[paneIndex] !== null) return null;
                return (
                  <div
                    key={`empty-${paneIndex}`}
                    style={getPaneStyle(paneIndex)}
                    className={cn(
                      'flex items-center justify-center',
                      paneIndex === focusedPane
                        ? 'ring-1 ring-inset ring-blue-500/25'
                        : 'ring-1 ring-inset ring-neutral-800/60'
                    )}
                    onPointerDown={() => {
                      if (paneIndex !== focusedPane) {
                        setFocusedPane(paneIndex);
                        focusedPaneRef.current = paneIndex;
                      }
                    }}
                  >
                    <p className="select-none text-[12px] text-neutral-600">
                      点击 Tab 标签将会话分配到此格
                    </p>
                  </div>
                );
              })}

            {splitLayout !== 'single' && (
              <div
                style={getDividerStyle()}
                className={cn(
                  'z-10 bg-neutral-800 hover:bg-blue-500/50',
                  splitLayout === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize'
                )}
                onMouseDown={handleDividerMouseDown}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
});
