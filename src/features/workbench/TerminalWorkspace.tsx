import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import {
  assignActiveSessionToPane,
  buildSplitModeState,
  cleanPaneSessionIds,
  focusPaneState,
  type FocusedPane,
  type PaneSessionIds,
  type SplitLayout,
} from '@/features/workbench/workbenchTerminalWorkspaceModel';
import { buildDesktopWindowChromeLayout } from '@/features/workbench/desktopWindowChromeModel';
import { TerminalWorkspaceBody } from '@/features/workbench/TerminalWorkspaceBody';
import { TerminalWorkspaceHeader } from '@/features/workbench/TerminalWorkspaceHeader';
import type { SshTerminalPaneHandle } from '@/features/workbench/SshTerminalPane';
import type {
  AgentSessionLock,
  ConnectionStatus,
  LiveSession,
  TerminalCommandExecutionResult,
} from '@/features/workbench/types';

export type TerminalWorkspaceHandle = {
  sendCommandToActive: (command: string) => void;
  executeCommandOnSession: (
    sessionId: string,
    command: string
  ) => Promise<TerminalCommandExecutionResult>;
};

type TerminalWorkspaceProps = {
  activeSessionId: string | null;
  agentSessionLock: AgentSessionLock | null;
  isMacShortcutPlatform: boolean;
  pendingInteractionCount: number;
  sessions: LiveSession[];
  sidebarCollapsed: boolean;
  visible?: boolean;
  onCloseSession: (sessionId: string) => void;
  onOpenNodeDashboard: (nodeId: string) => void;
  onOpenSftp: (nodeId: string) => void;
  onOpenNewConnection: () => void;
  onOpenPendingGates: () => void;
  onToggleSidebar: () => void;
  onSelectSession: (sessionId: string) => void;
  onSessionStatusChange: (sessionId: string, status: ConnectionStatus, errorMessage?: string) => void;
  onOpenAiAssistant: () => void;
  onOpenHelpDialog: () => void;
};

export const TerminalWorkspace = forwardRef<TerminalWorkspaceHandle, TerminalWorkspaceProps>(
  function TerminalWorkspace({
  activeSessionId,
  agentSessionLock,
  isMacShortcutPlatform,
  pendingInteractionCount,
  sessions,
  sidebarCollapsed,
  visible = true,
  onCloseSession,
  onOpenNodeDashboard,
  onOpenSftp,
  onOpenNewConnection,
  onOpenPendingGates,
  onToggleSidebar,
  onSelectSession,
  onSessionStatusChange,
  onOpenAiAssistant,
  onOpenHelpDialog,
}: TerminalWorkspaceProps, ref: React.Ref<TerminalWorkspaceHandle>) {
  const desktopWindowChrome = buildDesktopWindowChromeLayout({
    runtime: window.__OPSCLAW_RUNTIME__,
    location: window.location,
  });
  const terminalRefs = useRef<Record<string, SshTerminalPaneHandle | null>>({});

  useImperativeHandle(ref, () => ({
    sendCommandToActive(command: string) {
      if (!activeSessionId) return;
      terminalRefs.current[activeSessionId]?.sendCommand(command);
    },
    executeCommandOnSession(sessionId: string, command: string) {
      const terminal = terminalRefs.current[sessionId];
      if (!terminal) {
        return Promise.reject(new Error('目标会话不存在或尚未初始化。'));
      }

      return terminal.executeCommand(command);
    },
  }), [activeSessionId]);

  const [splitLayout, setSplitLayout] = useState<SplitLayout>('single');
  const [paneSessionIds, setPaneSessionIds] = useState<PaneSessionIds>([null, null]);
  const [focusedPane, setFocusedPane] = useState<FocusedPane>(0);
  const [splitRatio, setSplitRatio] = useState(0.5);

  const focusedPaneRef = useRef<FocusedPane>(0);
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
    setPaneSessionIds((prev) =>
      assignActiveSessionToPane(prev, focusedPaneRef.current, activeSessionId)
    );
  }, [activeSessionId]);

  // Clean up paneSessionIds when sessions are closed
  useEffect(() => {
    const sessionIds = sessions.map((session) => session.id);
    setPaneSessionIds((prev) => {
      const next = cleanPaneSessionIds(prev, sessionIds);
      return next[0] === prev[0] && next[1] === prev[1] ? prev : next;
    });
  }, [sessions]);

  const enterSplitMode = (layout: 'horizontal' | 'vertical') => {
    const nextState = buildSplitModeState(
      activeSessionId,
      sessions.map((session) => session.id),
      layout
    );
    setSplitLayout(nextState.splitLayout);
    splitLayoutRef.current = nextState.splitLayout;
    setPaneSessionIds(nextState.paneSessionIds);
    setFocusedPane(nextState.focusedPane);
    focusedPaneRef.current = nextState.focusedPane;
  };

  const exitSplitMode = () => {
    const target = paneSessionIds[focusedPaneRef.current] ?? activeSessionId;
    setSplitLayout('single');
    splitLayoutRef.current = 'single';
    if (target) onSelectSession(target);
  };

  const handlePaneFocus = (paneIndex: FocusedPane) => {
    const nextState = focusPaneState(paneSessionIds, paneIndex);
    setFocusedPane(nextState.focusedPane);
    focusedPaneRef.current = nextState.focusedPane;
    if (nextState.selectedSessionId) {
      onSelectSession(nextState.selectedSessionId);
    }
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

  const handleFocusEmptyPane = (paneIndex: FocusedPane) => {
    setFocusedPane(paneIndex);
    focusedPaneRef.current = paneIndex;
  };

  return (
    <section
      className="grid min-h-screen min-w-0 flex-1 bg-[var(--app-bg-elevated)]"
      style={{
        gridTemplateRows: desktopWindowChrome.topBarStyle
          ? 'calc(42px + env(titlebar-area-height, 0px)) 38px minmax(0,1fr)'
          : '42px 38px minmax(0,1fr)',
      }}
    >
      <TerminalWorkspaceHeader
        activeSession={activeSession}
        activeSessionId={activeSessionId}
        desktopInteractiveStyle={desktopWindowChrome.interactiveStyle}
        desktopTopBarStyle={desktopWindowChrome.topBarStyle}
        desktopWindowControlsInsetStyle={desktopWindowChrome.windowControlsInsetStyle}
        isMacShortcutPlatform={isMacShortcutPlatform}
        pendingInteractionCount={pendingInteractionCount}
        sessions={sessions}
        sidebarCollapsed={sidebarCollapsed}
        splitLayout={splitLayout}
        onCloseSession={onCloseSession}
        onEnterSplitMode={enterSplitMode}
        onExitSplitMode={exitSplitMode}
        onOpenAiAssistant={onOpenAiAssistant}
        onOpenHelpDialog={onOpenHelpDialog}
        onOpenPendingGates={onOpenPendingGates}
        onOpenNewConnection={onOpenNewConnection}
        onOpenSftp={onOpenSftp}
        onSelectSession={onSelectSession}
        onToggleSidebar={onToggleSidebar}
      />

      <TerminalWorkspaceBody
        activeSessionId={activeSessionId}
        agentSessionLock={agentSessionLock}
        focusedPane={focusedPane}
        paneSessionIds={paneSessionIds}
        sessions={sessions}
        sidebarCollapsed={sidebarCollapsed}
        visible={visible}
        splitContainerRef={splitContainerRef}
        splitLayout={splitLayout}
        splitRatio={splitRatio}
        terminalRefs={terminalRefs}
        onDividerMouseDown={handleDividerMouseDown}
        onFocusEmptyPane={handleFocusEmptyPane}
        onOpenNodeDashboard={onOpenNodeDashboard}
        onOpenNewConnection={onOpenNewConnection}
        onPointerFocusPane={handlePaneFocus}
        onSessionStatusChange={onSessionStatusChange}
        onToggleSidebar={onToggleSidebar}
      />
    </section>
  );
});
