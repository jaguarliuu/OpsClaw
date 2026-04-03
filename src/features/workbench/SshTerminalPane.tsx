import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SearchAddon } from '@xterm/addon-search';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import { SshTerminalContextMenu } from '@/features/workbench/SshTerminalContextMenu';
import { SshTerminalPasteOverlay } from '@/features/workbench/SshTerminalPasteOverlay';
import { SshTerminalSearchOverlay } from '@/features/workbench/SshTerminalSearchOverlay';
import { SshTerminalSuggestionOverlay } from '@/features/workbench/SshTerminalSuggestionOverlay';
import {
  resolveSshTerminalSuggestionOverlayPosition,
  type SshTerminalSuggestionOverlayPlacement,
} from '@/features/workbench/sshTerminalSuggestionOverlayModel';
import { TERMINAL_THEMES } from '@/features/workbench/terminalSettings';
import {
  appendTerminalTranscript,
  MAX_TERMINAL_TRANSCRIPT_LENGTH,
} from '@/features/workbench/sshTerminalCommandExecutionModel';
import { useSshTerminalConnection } from '@/features/workbench/useSshTerminalConnection';
import { useSshTerminalController } from '@/features/workbench/useSshTerminalController';
import { useSshTerminalContextMenu } from '@/features/workbench/useSshTerminalContextMenu';
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
const DEFAULT_SUGGESTION_OVERLAY_HEIGHT_PX = 40;

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
    const suggestionOverlayRef = useRef<HTMLDivElement | null>(null);
    const [isRuntimeReady, setIsRuntimeReady] = useState(false);
    const [suggestionOverlayPosition, setSuggestionOverlayPosition] = useState<{
      placement: SshTerminalSuggestionOverlayPlacement;
      top: number;
    }>({
      placement: 'below',
      top: 12,
    });

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
      closeContextMenu,
      contextMenuRef,
      contextMenuState,
      openContextMenu,
    } = useSshTerminalContextMenu();

    const {
      copyFeedbackText,
      copyFeedbackVisible,
      confirmPendingPaste,
      copySelection,
      dismissPendingPaste,
      pendingPaste,
      pasteFromClipboard,
      selectAll,
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

    useEffect(() => {
      if (!suggestionVisible || !suggestion) {
        return;
      }

      const updateSuggestionOverlayPosition = () => {
        const terminal = terminalRef.current;
        const container = containerRef.current;
        if (!terminal || !container) {
          return;
        }

        const nextPosition = resolveSshTerminalSuggestionOverlayPosition({
          cursorRow: terminal.buffer.active.cursorY,
          overlayHeight:
            suggestionOverlayRef.current?.offsetHeight ?? DEFAULT_SUGGESTION_OVERLAY_HEIGHT_PX,
          totalRows: terminal.rows,
          viewportHeight: container.clientHeight,
        });

        setSuggestionOverlayPosition((current) => {
          if (
            current.placement === nextPosition.placement &&
            current.top === nextPosition.top
          ) {
            return current;
          }

          return nextPosition;
        });
      };

      updateSuggestionOverlayPosition();
      window.addEventListener('resize', updateSuggestionOverlayPosition);

      return () => {
        window.removeEventListener('resize', updateSuggestionOverlayPosition);
      };
    }, [suggestion, suggestionVisible]);

    return (
      <div
        className={(show ?? active) ? 'relative block h-full w-full' : 'hidden h-full w-full'}
        onContextMenu={(event) => {
          event.preventDefault();
          openContextMenu(
            { x: event.clientX, y: event.clientY },
            { canCopySelection: terminalRef.current?.hasSelection() === true }
          );
        }}
      >
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
          <SshTerminalSuggestionOverlay
            ref={suggestionOverlayRef}
            placement={suggestionOverlayPosition.placement}
            suggestion={suggestion}
            top={suggestionOverlayPosition.top}
          />
        )}

        {copyFeedbackVisible ? (
          <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-md border border-emerald-500/20 bg-[var(--app-bg-elevated2)] px-3 py-2 text-xs font-medium text-emerald-400 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
            {copyFeedbackText}
          </div>
        ) : null}

        {contextMenuState ? (
          <SshTerminalContextMenu
            contextMenuRef={contextMenuRef}
            contextMenuState={contextMenuState}
            onCopySelection={copySelection}
            onPasteFromClipboard={pasteFromClipboard}
            onRequestClose={closeContextMenu}
            onSelectAll={selectAll}
          />
        ) : null}
      </div>
    );
  }
);
