import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { SshTerminalPane, type SshTerminalPaneHandle } from '@/features/workbench/SshTerminalPane';
import type { ConnectionStatus, LiveSession } from '@/features/workbench/types';
import { cn } from '@/lib/utils';

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

export function TerminalWorkspace({
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
}: TerminalWorkspaceProps) {
  const terminalRefs = useRef<Record<string, SshTerminalPaneHandle | null>>({});

  const activeSession = activeSessionId
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null;

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

      <div className="relative min-h-0 bg-[#121315]">
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
          sessions.map((session) => (
            <SshTerminalPane
              active={session.id === activeSessionId}
              key={session.id}
              onStatusChange={onSessionStatusChange}
              ref={(handle) => {
                terminalRefs.current[session.id] = handle;
              }}
              session={session}
            />
          ))
        )}
      </div>
    </section>
  );
}
