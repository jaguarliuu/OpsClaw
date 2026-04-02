import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { SearchAddon } from '@xterm/addon-search';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import { searchCommands, recordCommand } from '@/features/workbench/api';
import {
  shouldConfirmSshTerminalPaste,
  shouldToggleSshTerminalSearchShortcut,
  resolveSshTerminalInput,
} from '@/features/workbench/sshTerminalRuntimeModel';
import { loadTerminalRuntime } from '@/features/workbench/terminalRuntimeLoader';
import { TERMINAL_THEMES } from '@/features/workbench/terminalSettings';
import type { ConnectionStatus } from '@/features/workbench/types';

type UseSshTerminalRuntimeOptions = {
  containerRef: RefObject<HTMLDivElement | null>;
  disposeViewport: () => void;
  fitAddonRef: MutableRefObject<FitAddon | null>;
  initializedRef: MutableRefObject<boolean>;
  initializingRef: MutableRefObject<boolean>;
  inputBufferRef: MutableRefObject<string>;
  onRuntimeReadyChange: (ready: boolean) => void;
  onRuntimeLoadError: (status: ConnectionStatus, errorMessage?: string) => void;
  rejectPendingExecution: (message: string) => void;
  scheduleFitAndResize: () => void;
  searchAddonRef: MutableRefObject<SearchAddon | null>;
  sessionNodeIdRef: MutableRefObject<string | undefined>;
  settingsRef: MutableRefObject<{
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    scrollback: number;
    themeName: keyof typeof TERMINAL_THEMES;
  }>;
  terminalRef: MutableRefObject<Terminal | null>;
  toggleSearch: () => void;
  websocketRef: MutableRefObject<WebSocket | null>;
};

const SUGGESTION_QUERY_DELAY_MS = 150;

function logSshTerminalRuntime(event: string, details: Record<string, unknown> = {}) {
  console.info(`[SshTerminalRuntime] ${event}`, details);
}

export function useSshTerminalRuntime({
  containerRef,
  disposeViewport,
  fitAddonRef,
  initializedRef,
  initializingRef,
  inputBufferRef,
  onRuntimeReadyChange,
  onRuntimeLoadError,
  rejectPendingExecution,
  scheduleFitAndResize,
  searchAddonRef,
  sessionNodeIdRef,
  settingsRef,
  terminalRef,
  toggleSearch,
  websocketRef,
}: UseSshTerminalRuntimeOptions) {
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const suggestionRef = useRef<string | null>(null);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    suggestionRef.current = suggestion;
  }, [suggestion]);

  const fetchSuggestion = useCallback((input: string) => {
    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
    }

    if (input.length < 2) {
      setSuggestion(null);
      return;
    }

    suggestionTimerRef.current = setTimeout(() => {
      void searchCommands(input, sessionNodeIdRef.current).then((results) => {
        if (results.length > 0 && results[0].command.startsWith(input)) {
          setSuggestion(results[0].command);
        } else {
          setSuggestion(null);
        }
      });
    }, SUGGESTION_QUERY_DELAY_MS);
  }, [sessionNodeIdRef]);

  const confirmPendingPaste = useCallback(() => {
    if (pendingPaste === null) {
      return;
    }

    const websocket = websocketRef.current;
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: 'input', payload: pendingPaste }));
    }
    setPendingPaste(null);
  }, [pendingPaste, websocketRef]);

  const dismissPendingPaste = useCallback(() => {
    setPendingPaste(null);
  }, []);

  useEffect(() => {
    if (!containerRef.current || initializedRef.current || initializingRef.current) {
      return;
    }

    const container = containerRef.current;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    initializingRef.current = true;
    logSshTerminalRuntime('init:start', {
      hasContainer: true,
      initialized: initializedRef.current,
      initializing: initializingRef.current,
    });

    const initializeTerminal = async () => {
      try {
        const { Terminal, FitAddon, SearchAddon } = await loadTerminalRuntime();
        if (disposed || initializedRef.current) {
          initializingRef.current = false;
          return;
        }

        const initialSettings = settingsRef.current;
        const terminal = new Terminal({
          convertEol: true,
          cursorBlink: true,
          fontFamily: initialSettings.fontFamily,
          fontSize: initialSettings.fontSize,
          lineHeight: initialSettings.lineHeight,
          scrollback: initialSettings.scrollback,
          theme: TERMINAL_THEMES[initialSettings.themeName],
        });
        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);
        terminal.open(container);
        fitAddon.fit();
        terminal.focus();

        terminal.attachCustomKeyEventHandler((event) => {
          if (shouldToggleSshTerminalSearchShortcut(event)) {
            event.preventDefault();
            toggleSearch();
            return false;
          }

          return true;
        });

        const handlePaste = (event: ClipboardEvent) => {
          const text = event.clipboardData?.getData('text') ?? '';
          if (!shouldConfirmSshTerminalPaste(text)) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          setPendingPaste(text);
        };

        container.addEventListener('paste', handlePaste, { capture: true });

        const dataDisposable = terminal.onData((data) => {
          const resolution = resolveSshTerminalInput({
            currentSuggestion: suggestionRef.current,
            data,
            inputBuffer: inputBufferRef.current,
          });

          const websocket = websocketRef.current;
          if (websocket?.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'input', payload: resolution.forwardedInput }));
          }

          inputBufferRef.current = resolution.nextInputBuffer;
          setSuggestion(resolution.nextSuggestion);

          if (resolution.commandToRecord) {
            void recordCommand({
              command: resolution.commandToRecord,
              nodeId: sessionNodeIdRef.current,
            });
          }

          if (resolution.suggestionQuery !== null) {
            fetchSuggestion(resolution.suggestionQuery);
          }
        });

        const resizeObserver = new ResizeObserver(() => {
          scheduleFitAndResize();
        });

        resizeObserver.observe(container);

        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = searchAddon;
        initializedRef.current = true;
        initializingRef.current = false;
        logSshTerminalRuntime('init:ready', {
          cols: terminal.cols,
          rows: terminal.rows,
        });
        onRuntimeReadyChange(true);

        cleanup = () => {
          logSshTerminalRuntime('cleanup:start', {
            initialized: initializedRef.current,
          });
          container.removeEventListener('paste', handlePaste, { capture: true });
          dataDisposable.dispose();
          resizeObserver.disconnect();
          disposeViewport();
          if (suggestionTimerRef.current) {
            clearTimeout(suggestionTimerRef.current);
            suggestionTimerRef.current = null;
          }
          inputBufferRef.current = '';
          setSuggestion(null);
          setPendingPaste(null);
          rejectPendingExecution('终端已销毁，未完成的 Agent 命令已取消。');
          terminal.dispose();
          terminalRef.current = null;
          fitAddonRef.current = null;
          searchAddonRef.current = null;
          initializedRef.current = false;
          initializingRef.current = false;
          logSshTerminalRuntime('cleanup:done');
          onRuntimeReadyChange(false);
        };
      } catch (error) {
        if (disposed) {
          return;
        }

        initializingRef.current = false;
        console.error('[SshTerminalRuntime] init:error', error);
        onRuntimeReadyChange(false);
        onRuntimeLoadError(
          'error',
          error instanceof Error ? error.message : '终端运行时加载失败。'
        );
      }
    };

    void initializeTerminal();

    return () => {
      disposed = true;
      initializingRef.current = false;
      cleanup?.();
    };
  }, [
    containerRef,
    disposeViewport,
    fetchSuggestion,
    fitAddonRef,
    initializedRef,
    initializingRef,
    inputBufferRef,
    onRuntimeReadyChange,
    onRuntimeLoadError,
    rejectPendingExecution,
    scheduleFitAndResize,
    searchAddonRef,
    sessionNodeIdRef,
    settingsRef,
    terminalRef,
    toggleSearch,
    websocketRef,
  ]);

  return {
    confirmPendingPaste,
    dismissPendingPaste,
    pendingPaste,
    suggestion,
    suggestionVisible: suggestion !== null && inputBufferRef.current !== '',
  };
}
