import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SearchAddon } from '@xterm/addon-search';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import { SshTerminalPasteOverlay } from '@/features/workbench/SshTerminalPasteOverlay';
import { SshTerminalSearchOverlay } from '@/features/workbench/SshTerminalSearchOverlay';
import { SshTerminalSuggestionOverlay } from '@/features/workbench/SshTerminalSuggestionOverlay';
import { TERMINAL_THEMES } from '@/features/workbench/terminalSettings';
import {
  appendTerminalTranscript,
  MAX_TERMINAL_TRANSCRIPT_LENGTH,
} from '@/features/workbench/sshTerminalCommandExecutionModel';
import { useSshTerminalConnection } from '@/features/workbench/useSshTerminalConnection';
import { useSshTerminalController } from '@/features/workbench/useSshTerminalController';
import { useSshTerminalSearch } from '@/features/workbench/useSshTerminalSearch';
import { useSshTerminalRuntime } from '@/features/workbench/useSshTerminalRuntime';
import { useSshTerminalViewport } from '@/features/workbench/useSshTerminalViewport';
import { useTerminalSettings } from '@/features/workbench/useTerminalSettings';
import type {
  ConnectionStatus,
  LiveSession,
  TerminalCommandExecutionResult,
} from '@/features/workbench/types';

type SshTerminalPaneProps = {
  session: LiveSession;
  active: boolean;
  show?: boolean;
  onStatusChange: (sessionId: string, status: ConnectionStatus, errorMessage?: string) => void;
};

export type SshTerminalPaneHandle = {
  clear: () => void;
  copyVisibleContent: () => void;
  sendCommand: (command: string) => void;
  executeCommand: (command: string) => Promise<TerminalCommandExecutionResult>;
  getTranscript: () => string;
};
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
const MAX_RECONNECT_ATTEMPTS = 5;

function logSshTerminalPane(event: string, details: Record<string, unknown> = {}) {
  console.info(`[SshTerminalPane] ${event}`, details);
}

export const SshTerminalPane = forwardRef<SshTerminalPaneHandle, SshTerminalPaneProps>(
  function SshTerminalPane({ session, active, show, onStatusChange }, ref) {
    const { settings } = useTerminalSettings();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const websocketRef = useRef<WebSocket | null>(null);
    const initializedRef = useRef(false);
    const initializingRef = useRef(false);
    const sessionIdRef = useRef(session.id);
    const sessionNodeIdRef = useRef(session.nodeId);
    const onStatusChangeRef = useRef(onStatusChange);
    const settingsRef = useRef(settings);
    const intentionalCloseRef = useRef(false);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const everConnectedRef = useRef(false);
    const inputBufferRef = useRef('');
    const transcriptRef = useRef('');
    const [isRuntimeReady, setIsRuntimeReady] = useState(false);

    const {
      closeSearch,
      findNext,
      findPrev,
      handleSearchQueryChange,
      isSearchOpen,
      searchInputRef,
      searchQuery,
      toggleSearch,
    } = useSshTerminalSearch({
      searchAddonRef,
      terminalRef,
    });
    useEffect(() => {
      sessionIdRef.current = session.id;
      sessionNodeIdRef.current = session.nodeId;
      onStatusChangeRef.current = onStatusChange;
      settingsRef.current = settings;
    }, [onStatusChange, session.id, session.nodeId, settings]);

    const reportStatusChange = useCallback((status: ConnectionStatus, errorMessage?: string) => {
      onStatusChangeRef.current(sessionIdRef.current, status, errorMessage);
    }, []);

    const appendTranscript = useCallback((chunk: string) => {
      transcriptRef.current = appendTerminalTranscript(
        transcriptRef.current,
        chunk,
        MAX_TERMINAL_TRANSCRIPT_LENGTH
      );
    }, []);
    const {
      disposeViewport,
      queueTerminalOutput,
      resetViewportSize,
      scheduleFitAndResize,
      sendResize,
    } = useSshTerminalViewport({
      fitAddonRef,
      terminalRef,
      websocketRef,
    });

    const {
      controllerHandle,
      processPendingExecutionChunk,
      rejectPendingExecution,
    } = useSshTerminalController({
      containerRef,
      session,
      terminalRef,
      transcriptRef,
      websocketRef,
    });

    const {
      confirmPendingPaste,
      dismissPendingPaste,
      pendingPaste,
      suggestion,
      suggestionVisible,
    } = useSshTerminalRuntime({
      containerRef,
      disposeViewport,
      fitAddonRef,
      initializedRef,
      initializingRef,
      inputBufferRef,
      onRuntimeReadyChange: setIsRuntimeReady,
      onRuntimeLoadError: reportStatusChange,
      rejectPendingExecution,
      scheduleFitAndResize,
      searchAddonRef,
      sessionNodeIdRef,
      settingsRef,
      terminalRef,
      toggleSearch,
      websocketRef,
    });

    useEffect(() => {
      logSshTerminalPane('runtime:ready_change', {
        sessionId: session.id,
        isRuntimeReady,
      });
    }, [isRuntimeReady, session.id]);

    useImperativeHandle(ref, () => controllerHandle, [controllerHandle]);

    useSshTerminalConnection({
      appendTranscript,
      everConnectedRef,
      intentionalCloseRef,
      isRuntimeReady,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      processPendingExecutionChunk,
      queueTerminalOutput,
      reconnectAttemptRef,
      reconnectDelaysMs: RECONNECT_DELAYS_MS,
      reconnectTimerRef,
      rejectPendingExecution,
      reportStatusChange,
      resetViewportSize,
      scheduleFitAndResize,
      session,
      terminalRef,
      websocketRef,
    });

    useEffect(() => {
      if (!active) {
        return;
      }

      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;
      if (!terminal || !fitAddon) {
        return;
      }

      resetViewportSize();
      scheduleFitAndResize();
      terminal.focus();
    }, [active, resetViewportSize, scheduleFitAndResize]);

    useEffect(() => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      terminal.options.fontFamily = settings.fontFamily;
      terminal.options.fontSize = settings.fontSize;
      terminal.options.lineHeight = settings.lineHeight;
      terminal.options.scrollback = settings.scrollback;
      terminal.options.theme = TERMINAL_THEMES[settings.themeName];
      fitAddonRef.current?.fit();
      sendResize();
    }, [settings, sendResize]);

    return (
      <div className={(show ?? active) ? 'relative block h-full w-full' : 'hidden h-full w-full'}>
        <div className="xterm-pane h-full w-full" ref={containerRef} />

        {isSearchOpen && (
          <SshTerminalSearchOverlay
            onCloseSearch={closeSearch}
            onFindNext={findNext}
            onFindPrev={findPrev}
            onSearchQueryChange={handleSearchQueryChange}
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
          />
        )}

        {pendingPaste !== null && (
          <SshTerminalPasteOverlay
            pendingPaste={pendingPaste}
            onCancel={dismissPendingPaste}
            onConfirm={confirmPendingPaste}
          />
        )}

        {suggestionVisible && suggestion && (
          <SshTerminalSuggestionOverlay suggestion={suggestion} />
        )}
      </div>
    );
  }
);
