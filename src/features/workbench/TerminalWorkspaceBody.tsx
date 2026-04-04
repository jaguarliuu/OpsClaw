import type { MutableRefObject, MouseEvent as ReactMouseEvent, RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { SshTerminalPane, type SshTerminalPaneHandle } from '@/features/workbench/SshTerminalPane';
import type { AgentSessionLock, ConnectionStatus, LiveSession } from '@/features/workbench/types';
import {
  buildDividerStyle,
  buildPaneStyle,
  buildSessionRenderState,
  listEmptyPaneIndexes,
  type FocusedPane,
  type PaneSessionIds,
  type SplitLayout,
} from '@/features/workbench/workbenchTerminalWorkspaceModel';
import { cn } from '@/lib/utils';

type TerminalWorkspaceBodyProps = {
  activeSessionId: string | null;
  agentSessionLock: AgentSessionLock | null;
  focusedPane: FocusedPane;
  paneSessionIds: PaneSessionIds;
  sessions: LiveSession[];
  sidebarCollapsed: boolean;
  splitContainerRef: RefObject<HTMLDivElement | null>;
  splitLayout: SplitLayout;
  splitRatio: number;
  terminalRefs: MutableRefObject<Record<string, SshTerminalPaneHandle | null>>;
  onFocusEmptyPane: (paneIndex: FocusedPane) => void;
  onOpenNewConnection: () => void;
  onPointerFocusPane: (paneIndex: FocusedPane) => void;
  onSessionStatusChange: (
    sessionId: string,
    status: ConnectionStatus,
    errorMessage?: string
  ) => void;
  onToggleSidebar: () => void;
  onDividerMouseDown: (event: ReactMouseEvent) => void;
};

export function TerminalWorkspaceBody({
  activeSessionId,
  agentSessionLock,
  focusedPane,
  paneSessionIds,
  sessions,
  sidebarCollapsed,
  splitContainerRef,
  splitLayout,
  splitRatio,
  terminalRefs,
  onDividerMouseDown,
  onFocusEmptyPane,
  onOpenNewConnection,
  onPointerFocusPane,
  onSessionStatusChange,
  onToggleSidebar,
}: TerminalWorkspaceBodyProps) {
  const splitPaneLayout =
    splitLayout === 'single' ? null : splitLayout;

  return (
    <div className="relative min-h-0 bg-[var(--app-bg-base)]" ref={splitContainerRef}>
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
            const renderState = buildSessionRenderState(
              session.id,
              splitLayout,
              paneSessionIds,
              focusedPane
            );

            if (renderState.renderMode === 'single') {
              return (
                <SshTerminalPane
                  active={session.id === activeSessionId}
                  agentSessionLock={agentSessionLock?.sessionId === session.id ? agentSessionLock : null}
                  key={session.id}
                  onStatusChange={onSessionStatusChange}
                  ref={(handle) => {
                    terminalRefs.current[session.id] = handle;
                  }}
                  session={session}
                />
              );
            }

            if (renderState.renderMode === 'hidden' || renderState.paneIndex === null) {
              return (
                <SshTerminalPane
                  active={false}
                  agentSessionLock={agentSessionLock?.sessionId === session.id ? agentSessionLock : null}
                  key={session.id}
                  onStatusChange={onSessionStatusChange}
                  ref={(handle) => {
                    terminalRefs.current[session.id] = handle;
                  }}
                  session={session}
                />
              );
            }

            if (!splitPaneLayout) {
              return null;
            }

            return (
              <div
                key={session.id}
                style={buildPaneStyle(splitPaneLayout, renderState.paneIndex, splitRatio)}
                className={cn(
                  renderState.isFocusedPane
                    ? 'ring-1 ring-inset ring-blue-500/25'
                    : 'ring-1 ring-inset ring-neutral-800/60'
                )}
                onPointerDown={() => {
                  if (!renderState.isFocusedPane) {
                    onPointerFocusPane(renderState.paneIndex);
                  }
                }}
              >
                <SshTerminalPane
                  active={renderState.isFocusedPane}
                  agentSessionLock={agentSessionLock?.sessionId === session.id ? agentSessionLock : null}
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

          {splitPaneLayout
            ? listEmptyPaneIndexes(splitLayout, paneSessionIds).map((paneIndex) => (
                <div
                  key={`empty-${paneIndex}`}
                  style={buildPaneStyle(splitPaneLayout, paneIndex, splitRatio)}
                  className={cn(
                    'flex items-center justify-center',
                    paneIndex === focusedPane
                      ? 'ring-1 ring-inset ring-blue-500/25'
                      : 'ring-1 ring-inset ring-neutral-800/60'
                  )}
                  onPointerDown={() => {
                    if (paneIndex !== focusedPane) {
                      onFocusEmptyPane(paneIndex);
                    }
                  }}
                >
                  <p className="select-none text-[12px] text-neutral-600">
                    点击 Tab 标签将会话分配到此格
                  </p>
                </div>
              ))
            : null}

          {splitPaneLayout ? (
            <div
              style={buildDividerStyle(splitPaneLayout, splitRatio)}
              className={cn(
                'z-10 bg-[var(--app-bg-elevated3)] hover:bg-blue-500/50',
                splitPaneLayout === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize'
              )}
              onMouseDown={onDividerMouseDown}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
