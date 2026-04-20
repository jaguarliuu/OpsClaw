import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

import type { SshTerminalPaneHandle } from '@/features/workbench/SshTerminalPane';
import type {
  LiveSession,
  TerminalCommandExecutionResult,
} from '@/features/workbench/types';
import {
  assignActiveSessionToPane,
  buildSplitModeState,
  cleanPaneSessionIds,
  focusPaneState,
  type FocusedPane,
  type PaneSessionIds,
  type SplitLayout,
} from '@/features/workbench/workbenchTerminalWorkspaceModel';

export type TerminalWorkspaceController = {
  focusedPane: FocusedPane;
  paneSessionIds: PaneSessionIds;
  splitContainerRef: React.RefObject<HTMLDivElement | null>;
  splitLayout: SplitLayout;
  splitRatio: number;
  terminalRefs: React.MutableRefObject<Record<string, SshTerminalPaneHandle | null>>;
  enterSplitMode: (layout: 'horizontal' | 'vertical') => void;
  executeCommandOnSession: (
    sessionId: string,
    command: string
  ) => Promise<TerminalCommandExecutionResult>;
  exitSplitMode: () => void;
  getActiveTranscript: (sessionId: string) => string;
  handleDividerMouseDown: (event: ReactMouseEvent) => void;
  handleFocusEmptyPane: (paneIndex: FocusedPane) => void;
  handlePointerFocusPane: (paneIndex: FocusedPane) => void;
  sendCommandToActive: (command: string) => void;
};

export function useTerminalWorkspaceController(input: {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  sessions: LiveSession[];
}): TerminalWorkspaceController {
  const { activeSessionId, onSelectSession, sessions } = input;
  const terminalRefs = useRef<Record<string, SshTerminalPaneHandle | null>>({});
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

  useEffect(() => {
    if (splitLayoutRef.current === 'single' || !activeSessionId) {
      return;
    }

    setPaneSessionIds((prev) =>
      assignActiveSessionToPane(prev, focusedPaneRef.current, activeSessionId)
    );
  }, [activeSessionId]);

  useEffect(() => {
    const sessionIds = sessions.map((session) => session.id);
    setPaneSessionIds((prev) => {
      const next = cleanPaneSessionIds(prev, sessionIds);
      return next[0] === prev[0] && next[1] === prev[1] ? prev : next;
    });
  }, [sessions]);

  const enterSplitMode = useCallback((layout: 'horizontal' | 'vertical') => {
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
  }, [activeSessionId, sessions]);

  const exitSplitMode = useCallback(() => {
    const target = paneSessionIds[focusedPaneRef.current] ?? activeSessionId;
    setSplitLayout('single');
    splitLayoutRef.current = 'single';
    if (target) {
      onSelectSession(target);
    }
  }, [activeSessionId, onSelectSession, paneSessionIds]);

  const handlePointerFocusPane = useCallback((paneIndex: FocusedPane) => {
    const nextState = focusPaneState(paneSessionIds, paneIndex);
    setFocusedPane(nextState.focusedPane);
    focusedPaneRef.current = nextState.focusedPane;
    if (nextState.selectedSessionId) {
      onSelectSession(nextState.selectedSessionId);
    }
  }, [onSelectSession, paneSessionIds]);

  const handleFocusEmptyPane = useCallback((paneIndex: FocusedPane) => {
    setFocusedPane(paneIndex);
    focusedPaneRef.current = paneIndex;
  }, []);

  const handleDividerMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    isDraggingRef.current = true;
    const layout = splitLayoutRef.current;
    const startPos = layout === 'horizontal' ? event.clientX : event.clientY;
    const startRatio = splitRatio;
    const containerEl = splitContainerRef.current;
    if (!containerEl) {
      return;
    }

    const onMouseMove = (mouseEvent: MouseEvent) => {
      if (!isDraggingRef.current || dragRafRef.current !== null) {
        return;
      }

      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = null;
        const containerSize =
          layout === 'horizontal' ? containerEl.offsetWidth : containerEl.offsetHeight;
        const delta =
          ((layout === 'horizontal' ? mouseEvent.clientX : mouseEvent.clientY) - startPos)
          / containerSize;
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
  }, [splitRatio]);

  const sendCommandToActive = useCallback((command: string) => {
    if (!activeSessionId) {
      return;
    }

    terminalRefs.current[activeSessionId]?.sendCommand(command);
  }, [activeSessionId]);

  const executeCommandOnSession = useCallback((
    sessionId: string,
    command: string
  ) => {
    const terminal = terminalRefs.current[sessionId];
    if (!terminal) {
      return Promise.reject(new Error('目标会话不存在或尚未初始化。'));
    }

    return terminal.executeCommand(command);
  }, []);

  const getActiveTranscript = useCallback((sessionId: string): string => {
    return terminalRefs.current[sessionId]?.getTranscript() ?? '';
  }, []);

  return {
    focusedPane,
    paneSessionIds,
    splitContainerRef,
    splitLayout,
    splitRatio,
    terminalRefs,
    enterSplitMode,
    executeCommandOnSession,
    exitSplitMode,
    getActiveTranscript,
    handleDividerMouseDown,
    handleFocusEmptyPane,
    handlePointerFocusPane,
    sendCommandToActive,
  };
}
