import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { SearchAddon } from '@xterm/addon-search';
import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

import { searchCommands, recordCommand } from '@/features/workbench/api';
import {
  buildSshTerminalCopyFeedbackText,
  SSH_TERMINAL_COPY_FEEDBACK_DURATION_MS,
} from '@/features/workbench/sshTerminalCopyFeedbackModel';
import {
  createSshTerminalImeState,
  markSshTerminalImeCompositionEnd,
  markSshTerminalImeCompositionStart,
  resolveSshTerminalClipboardShortcut,
  shouldBlockSshTerminalCompositionConfirm,
  shouldConfirmSshTerminalPaste,
  shouldToggleSshTerminalSearchShortcut,
  resolveSshTerminalInput,
} from '@/features/workbench/sshTerminalRuntimeModel';
import { isAgentSessionLocked } from '@/features/workbench/agentSessionModel';
import { loadTerminalRuntime } from '@/features/workbench/terminalRuntimeLoader';
import { TERMINAL_THEMES } from '@/features/workbench/terminalSettings';
import type { AgentSessionLock, ConnectionStatus } from '@/features/workbench/types';

type UseSshTerminalRuntimeOptions = {
  agentSessionLock: AgentSessionLock | null;
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
  agentSessionLock,
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
  const [copyFeedbackVisible, setCopyFeedbackVisible] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAgentLockedRef = useRef(false);
  const imeStateRef = useRef(createSshTerminalImeState());
  const suggestionRef = useRef<string | null>(null);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    suggestionRef.current = suggestion;
  }, [suggestion]);

  const isAgentLocked = isAgentSessionLocked(agentSessionLock);

  useEffect(() => {
    isAgentLockedRef.current = isAgentLocked;
  }, [isAgentLocked]);

  useEffect(() => {
    if (!isAgentLocked) {
      return;
    }

    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = null;
    }
    setSuggestion(null);
  }, [isAgentLocked]);

  const readClipboardText = useCallback(async () => {
    if (window.__OPSCLAW_CLIPBOARD__) {
      return window.__OPSCLAW_CLIPBOARD__.readText();
    }
    if (typeof navigator.clipboard?.readText === 'function') {
      return navigator.clipboard.readText();
    }
    throw new Error('剪贴板读取不可用。');
  }, []);

  const writeClipboardText = useCallback(async (text: string) => {
    if (!text) {
      return;
    }

    if (window.__OPSCLAW_CLIPBOARD__) {
      await window.__OPSCLAW_CLIPBOARD__.writeText(text);
      return;
    }
    if (typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error('剪贴板写入不可用。');
  }, []);

  const forwardPasteText = useCallback((text: string) => {
    if (!text) {
      return;
    }

    if (shouldConfirmSshTerminalPaste(text)) {
      setPendingPaste(text);
      return;
    }

    const websocket = websocketRef.current;
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: 'input', payload: text }));
    }
  }, [websocketRef]);

  const fetchSuggestion = useCallback((input: string) => {
    if (isAgentLockedRef.current) {
      setSuggestion(null);
      return;
    }

    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
    }

    if (input.length < 2) {
      setSuggestion(null);
      return;
    }

    suggestionTimerRef.current = setTimeout(() => {
      void searchCommands(input, sessionNodeIdRef.current)
        .then((results) => {
          if (results.length > 0 && results[0].command.startsWith(input)) {
            setSuggestion(results[0].command);
          } else {
            setSuggestion(null);
          }
        })
        .catch((error) => {
          console.error('[SshTerminalRuntime] command-history:search_error', error);
          setSuggestion(null);
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

  const showCopyFeedback = useCallback(() => {
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
    }

    setCopyFeedbackVisible(true);
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopyFeedbackVisible(false);
      copyFeedbackTimerRef.current = null;
    }, SSH_TERMINAL_COPY_FEEDBACK_DURATION_MS);
  }, []);

  const copySelection = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal?.hasSelection()) {
      return;
    }

    const selectedText = terminal.getSelection();
    void writeClipboardText(selectedText).catch((error) => {
      console.error('[SshTerminalRuntime] clipboard:copy_error', error);
    });
    showCopyFeedback();
  }, [showCopyFeedback, terminalRef, writeClipboardText]);

  const pasteFromClipboard = useCallback(() => {
    void readClipboardText()
      .then((text) => {
        forwardPasteText(text);
      })
      .catch((error) => {
        console.error('[SshTerminalRuntime] clipboard:paste_error', error);
      });
  }, [forwardPasteText, readClipboardText]);

  const selectAll = useCallback(() => {
    terminalRef.current?.selectAll();
    terminalRef.current?.focus();
  }, [terminalRef]);

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

        const terminalTextarea = terminal.textarea;

        const handleCompositionStart = () => {
          imeStateRef.current = markSshTerminalImeCompositionStart(imeStateRef.current);
        };

        const handleCompositionEnd = () => {
          imeStateRef.current = markSshTerminalImeCompositionEnd(imeStateRef.current, Date.now());
        };

        terminalTextarea?.addEventListener('compositionstart', handleCompositionStart);
        terminalTextarea?.addEventListener('compositionend', handleCompositionEnd);

        terminal.attachCustomKeyEventHandler((event) => {
          if (
            shouldBlockSshTerminalCompositionConfirm({
              ...event,
              imeState: imeStateRef.current,
              now: Date.now(),
            })
          ) {
            event.preventDefault();
            return false;
          }

          const clipboardShortcut = resolveSshTerminalClipboardShortcut({
            event,
            hasSelection: terminal.hasSelection(),
          });
          if (clipboardShortcut === 'copy-selection') {
            event.preventDefault();
            copySelection();
            return false;
          }

          if (clipboardShortcut === 'paste-from-clipboard') {
            event.preventDefault();
            pasteFromClipboard();
            return false;
          }

          if (shouldToggleSshTerminalSearchShortcut(event)) {
            event.preventDefault();
            toggleSearch();
            return false;
          }

          return true;
        });

        const handlePaste = (event: ClipboardEvent) => {
          const text = event.clipboardData?.getData('text') ?? '';
          event.preventDefault();
          event.stopPropagation();
          forwardPasteText(text);
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

          if (!isAgentLockedRef.current && resolution.commandToRecord) {
            void recordCommand({
              command: resolution.commandToRecord,
              nodeId: sessionNodeIdRef.current,
            }).catch((error) => {
              console.error('[SshTerminalRuntime] command-history:record_error', error);
            });
          }

          if (!isAgentLockedRef.current && resolution.suggestionQuery !== null) {
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
          terminalTextarea?.removeEventListener('compositionstart', handleCompositionStart);
          terminalTextarea?.removeEventListener('compositionend', handleCompositionEnd);
          container.removeEventListener('paste', handlePaste, { capture: true });
          dataDisposable.dispose();
          resizeObserver.disconnect();
          disposeViewport();
          if (suggestionTimerRef.current) {
            clearTimeout(suggestionTimerRef.current);
            suggestionTimerRef.current = null;
          }
          if (copyFeedbackTimerRef.current) {
            clearTimeout(copyFeedbackTimerRef.current);
            copyFeedbackTimerRef.current = null;
          }
          setCopyFeedbackVisible(false);
          imeStateRef.current = createSshTerminalImeState();
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
    readClipboardText,
    scheduleFitAndResize,
    searchAddonRef,
    sessionNodeIdRef,
    settingsRef,
    terminalRef,
    toggleSearch,
    websocketRef,
    copySelection,
    pasteFromClipboard,
    forwardPasteText,
    writeClipboardText,
  ]);

  return {
    copyFeedbackText: buildSshTerminalCopyFeedbackText(),
    copyFeedbackVisible,
    confirmPendingPaste,
    copySelection,
    dismissPendingPaste,
    pendingPaste,
    pasteFromClipboard,
    selectAll,
    suggestion,
    suggestionVisible: !isAgentLocked && suggestion !== null && inputBufferRef.current !== '',
  };
}
