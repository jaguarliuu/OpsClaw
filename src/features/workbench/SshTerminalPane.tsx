import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import type { SearchAddon } from '@xterm/addon-search';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import { TerminalQuickScriptDialog } from '@/features/workbench/TerminalQuickScriptDialog';
import { SshTerminalContextMenu } from '@/features/workbench/SshTerminalContextMenu';
import { SshTerminalPasteOverlay } from '@/features/workbench/SshTerminalPasteOverlay';
import { SshTerminalSearchOverlay } from '@/features/workbench/SshTerminalSearchOverlay';
import { SshTerminalSuggestionOverlay } from '@/features/workbench/SshTerminalSuggestionOverlay';
import { fetchScripts } from '@/features/workbench/scriptApi';
import {
  isScriptLibraryChangeRelevant,
  subscribeScriptLibraryChanged,
} from '@/features/workbench/scriptLibraryEvents';
import {
  buildScriptVariableInitialValues,
  renderScriptTemplate,
  validateScriptVariableValues,
} from '@/features/workbench/scriptLibraryModel';
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
import { getAgentSessionLockBannerText } from '@/features/workbench/agentSessionModel';
import type {
  AgentSessionLock,
  ConnectionStatus,
  LiveSession,
  ScriptLibraryItem,
  TerminalCommandExecutionResult,
} from '@/features/workbench/types';

type SshTerminalPaneProps = {
  session: LiveSession;
  active: boolean;
  agentSessionLock: AgentSessionLock | null;
  show?: boolean;
  onOpenNodeDashboard: (nodeId: string) => void;
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
  function SshTerminalPane({
    session,
    active,
    agentSessionLock,
    show,
    onOpenNodeDashboard,
    onStatusChange,
  }, ref) {
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
    const quickScriptsRef = useRef<ScriptLibraryItem[]>([]);
    const [isRuntimeReady, setIsRuntimeReady] = useState(false);
    const [quickScripts, setQuickScripts] = useState<ScriptLibraryItem[]>([]);
    const [quickScriptsError, setQuickScriptsError] = useState<string | null>(null);
    const [activeQuickScript, setActiveQuickScript] = useState<ScriptLibraryItem | null>(null);
    const [quickScriptVariableValues, setQuickScriptVariableValues] = useState<Record<string, string>>({});
    const [quickScriptError, setQuickScriptError] = useState<string | null>(null);
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
      agentSessionLock,
      containerRef,
      session,
      terminalRef,
      transcriptRef,
      websocketRef,
    });

    const handleCloseQuickScriptDialog = useCallback(() => {
      setActiveQuickScript(null);
      setQuickScriptError(null);
    }, []);

    const handleConfirmQuickScript = useCallback(() => {
      if (!activeQuickScript) {
        return;
      }

      const validation = validateScriptVariableValues(
        activeQuickScript.variables,
        quickScriptVariableValues
      );
      if (!validation.ok) {
        setQuickScriptError(validation.message);
        return;
      }

      controllerHandle.sendCommand(
        renderScriptTemplate(activeQuickScript.content, quickScriptVariableValues)
      );
      setActiveQuickScript(null);
      setQuickScriptError(null);
    }, [activeQuickScript, controllerHandle, quickScriptVariableValues]);

    const handleExecuteQuickScript = useCallback((script: ScriptLibraryItem) => {
      if (script.kind === 'plain') {
        setQuickScriptError(null);
        controllerHandle.sendCommand(script.content);
        return;
      }

      setQuickScriptVariableValues(buildScriptVariableInitialValues(script.variables));
      setQuickScriptError(null);
      setActiveQuickScript(script);
    }, [controllerHandle]);

    useEffect(() => {
      quickScriptsRef.current = quickScripts;
    }, [quickScripts]);

    useEffect(() => {
      let cancelled = false;

      const reloadQuickScripts = async () => {
        try {
          const items = await fetchScripts(session.nodeId ?? null);
          if (cancelled) {
            return;
          }

          setQuickScripts(items);
          setQuickScriptsError(null);
        } catch (error) {
          if (cancelled) {
            return;
          }

          setQuickScripts([]);
          setQuickScriptsError(error instanceof Error ? error.message : '快捷脚本加载失败。');
        }
      };

      void reloadQuickScripts();

      const unsubscribe = subscribeScriptLibraryChanged((detail) => {
        if (!isScriptLibraryChangeRelevant(detail, session.nodeId ?? null)) {
          return;
        }

        void reloadQuickScripts();
      });

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }, [session.nodeId]);

    useEffect(() => {
      if (!quickScriptsError) {
        return;
      }
      console.error('[SshTerminalPane] quick-script:load_error', {
        sessionId: session.id,
        message: quickScriptsError,
      });
    }, [quickScriptsError, session.id]);

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
      quickScriptItems,
      quickScriptVisible,
      selectAll,
      suggestion,
      suggestionVisible,
    } = useSshTerminalRuntime({
      agentSessionLock,
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
      transcriptRef,
      toggleSearch,
      quickScriptsRef,
      onOpenNodeDashboard: () => {
        if (session.nodeId) {
          onOpenNodeDashboard(session.nodeId);
        }
      },
      onExecuteQuickScript: handleExecuteQuickScript,
      onQuickScriptNotFound: (query) => {
        setQuickScriptError(`未找到别名为 "${query}" 的快捷脚本。`);
      },
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
      const hasOverlay =
        (quickScriptVisible && quickScriptItems.length > 0) || (suggestionVisible && suggestion);
      if (!hasOverlay) {
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
    }, [quickScriptItems.length, quickScriptVisible, suggestion, suggestionVisible]);

    return (
      <div
        className={(show ?? active) ? 'relative block h-full w-full px-3 pt-3 pb-1' : 'hidden h-full w-full px-3 pt-3 pb-1'}
        onContextMenu={(event) => {
          event.preventDefault();
          openContextMenu(
            { x: event.clientX, y: event.clientY },
            { canCopySelection: terminalRef.current?.hasSelection() === true }
          );
        }}
        >
          <div
            className="relative h-full w-full overflow-hidden rounded-xl bg-[var(--app-bg-elevated2)]"
            style={
              {
                '--terminal-surface-bg': TERMINAL_THEMES[settings.themeName].background,
              } as CSSProperties
            }
          >
          <div className="xterm-pane h-full w-full" ref={containerRef} />

          {agentSessionLock ? (
            <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-sm">
              <div>{getAgentSessionLockBannerText(agentSessionLock)}</div>
              <div className="mt-1 font-mono text-[11px] text-amber-100/80">
                {agentSessionLock.command}
              </div>
            </div>
          ) : null}

          {isSearchOpen ? (
            <SshTerminalSearchOverlay
              onCloseSearch={closeSearch}
              onFindNext={findNext}
              onFindPrev={findPrev}
              onSearchQueryChange={handleSearchQueryChange}
              searchInputRef={searchInputRef}
              searchQuery={searchQuery}
            />
          ) : null}

          {pendingPaste !== null ? (
            <SshTerminalPasteOverlay
              pendingPaste={pendingPaste}
              onCancel={dismissPendingPaste}
              onConfirm={confirmPendingPaste}
            />
          ) : null}

          {quickScriptVisible && quickScriptItems.length > 0 ? (
            <SshTerminalSuggestionOverlay
              ref={suggestionOverlayRef}
              placement={suggestionOverlayPosition.placement}
              top={suggestionOverlayPosition.top}
              title="快捷脚本"
              hint="按 Tab 补全，回车执行"
              items={quickScriptItems}
            />
          ) : suggestionVisible && suggestion ? (
            <SshTerminalSuggestionOverlay
              ref={suggestionOverlayRef}
              placement={suggestionOverlayPosition.placement}
              top={suggestionOverlayPosition.top}
              title="命令建议"
              hint="按 Tab 接受"
              items={[
                {
                  id: 'history-suggestion',
                  label: suggestion,
                  detail: '按 Tab 接受',
                  highlighted: true,
                },
              ]}
            />
          ) : null}

          {copyFeedbackVisible ? (
            <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-md border border-emerald-500/20 bg-[var(--app-bg-elevated2)] px-3 py-2 text-xs font-medium text-emerald-400 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
              {copyFeedbackText}
            </div>
          ) : null}

          {quickScriptError && !activeQuickScript ? (
            <div className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
              {quickScriptError}
            </div>
          ) : null}

          <TerminalQuickScriptDialog
            errorMessage={activeQuickScript ? quickScriptError : null}
            onChange={(name, value) => {
              setQuickScriptVariableValues((current) => ({
                ...current,
                [name]: value,
              }));
              if (quickScriptError) {
                setQuickScriptError(null);
              }
            }}
            onClose={handleCloseQuickScriptDialog}
            onConfirm={handleConfirmQuickScript}
            open={activeQuickScript !== null}
            script={activeQuickScript}
            values={quickScriptVariableValues}
          />

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
      </div>
    );
  }
);
