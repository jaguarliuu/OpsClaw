import { SearchAddon } from '@xterm/addon-search';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { buildTerminalWebSocketUrl } from '@/features/workbench/terminalSocket';
import { useTerminalSettings } from '@/features/workbench/TerminalSettingsContext';
import { TERMINAL_THEMES } from '@/features/workbench/terminalSettings';
import { recordCommand } from '@/features/workbench/api';
import type { ConnectionStatus, LiveSession } from '@/features/workbench/types';

type ServerMessage =
  | { type: 'status'; payload: { state: 'connecting' | 'connected' | 'closed' } }
  | { type: 'data'; payload: string }
  | { type: 'error'; payload: { message: string } };

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
};

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];
const MAX_RECONNECT_ATTEMPTS = 5;

export const SshTerminalPane = forwardRef<SshTerminalPaneHandle, SshTerminalPaneProps>(
  function SshTerminalPane({ session, active, show, onStatusChange }, ref) {
    const { settings } = useTerminalSettings();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const websocketRef = useRef<WebSocket | null>(null);
    const initializedRef = useRef(false);
    const sessionIdRef = useRef(session.id);
    const onStatusChangeRef = useRef(onStatusChange);
    const resizeFrameRef = useRef<number | null>(null);
    const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
    const writeFrameRef = useRef<number | null>(null);
    const pendingOutputRef = useRef('');
    const intentionalCloseRef = useRef(false);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const everConnectedRef = useRef(false);
    const inputBufferRef = useRef('');

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [pendingPaste, setPendingPaste] = useState<string | null>(null);

    useEffect(() => {
      sessionIdRef.current = session.id;
      onStatusChangeRef.current = onStatusChange;
    }, [onStatusChange, session.id]);

    const reportStatusChange = (status: ConnectionStatus, errorMessage?: string) => {
      onStatusChangeRef.current(sessionIdRef.current, status, errorMessage);
    };

    const flushTerminalOutput = useCallback(() => {
      const terminal = terminalRef.current;
      const pendingOutput = pendingOutputRef.current;

      writeFrameRef.current = null;

      if (!terminal || !pendingOutput) {
        return;
      }

      pendingOutputRef.current = '';
      terminal.write(pendingOutput);
    }, []);

    const queueTerminalOutput = useCallback((chunk: string) => {
      pendingOutputRef.current += chunk;

      if (writeFrameRef.current !== null) {
        return;
      }

      writeFrameRef.current = window.requestAnimationFrame(flushTerminalOutput);
    }, [flushTerminalOutput]);

    const sendResize = useCallback(() => {
      const terminal = terminalRef.current;
      const websocket = websocketRef.current;

      if (!terminal || !websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      const nextSize = {
        cols: terminal.cols,
        rows: terminal.rows,
      };
      const lastSize = lastSizeRef.current;

      if (lastSize && lastSize.cols === nextSize.cols && lastSize.rows === nextSize.rows) {
        return;
      }

      lastSizeRef.current = nextSize;
      websocket.send(JSON.stringify({ type: 'resize', payload: nextSize }));
    }, []);

    const scheduleFitAndResize = useCallback(() => {
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        fitAddonRef.current?.fit();
        sendResize();
      });
    }, [sendResize]);

    const findNext = useCallback(() => {
      searchAddonRef.current?.findNext(searchQuery, { caseSensitive: false, incremental: false });
    }, [searchQuery]);

    const findPrev = useCallback(() => {
      searchAddonRef.current?.findPrevious(searchQuery, { caseSensitive: false, incremental: false });
    }, [searchQuery]);

    const closeSearch = useCallback(() => {
      setIsSearchOpen(false);
      setSearchQuery('');
      searchAddonRef.current?.findNext(''); // clear highlights
      terminalRef.current?.focus();
    }, []);

    useEffect(() => {
      if (isSearchOpen) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    }, [isSearchOpen]);

    useEffect(() => {
      if (!searchQuery) {
        searchAddonRef.current?.findNext('');
        return;
      }
      searchAddonRef.current?.findNext(searchQuery, { caseSensitive: false, incremental: true });
    }, [searchQuery]);

    useImperativeHandle(ref, () => ({
      clear() {
        terminalRef.current?.clear();
      },
      copyVisibleContent() {
        const text = containerRef.current?.textContent ?? '';
        if (text) {
          void navigator.clipboard.writeText(text);
        }
      },
      sendCommand(command) {
        const trimmed = command.trim();
        if (!trimmed) {
          return;
        }

        const websocket = websocketRef.current;
        if (websocket?.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: 'input', payload: `${trimmed}\n` }));
          void recordCommand({ command: trimmed, nodeId: session.nodeId });
        }
      },
    }));

    useEffect(() => {
      if (!containerRef.current || initializedRef.current) {
        return;
      }

      const terminal = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        scrollback: settings.scrollback,
        theme: TERMINAL_THEMES[settings.themeName],
      });
      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(searchAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();
      terminal.focus();

      terminal.attachCustomKeyEventHandler((domEvent) => {
        if ((domEvent.ctrlKey || domEvent.metaKey) && domEvent.key === 'f' && domEvent.type === 'keydown') {
          domEvent.preventDefault();
          setIsSearchOpen((prev) => !prev);
          return false;
        }
        return true;
      });

      const handlePaste = (event: ClipboardEvent) => {
        const text = event.clipboardData?.getData('text') ?? '';
        if (!text.includes('\n')) return;
        event.preventDefault();
        event.stopPropagation();
        setPendingPaste(text);
      };
      containerRef.current.addEventListener('paste', handlePaste, { capture: true });

      const dataDisposable = terminal.onData((data) => {
        const websocket = websocketRef.current;
        if (websocket?.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: 'input', payload: data }));
        }

        // Shadow buffer: track typed input to record commands on Enter
        if (data === '\r' || data === '\n') {
          const cmd = inputBufferRef.current.trim();
          if (cmd) void recordCommand({ command: cmd, nodeId: session.nodeId });
          inputBufferRef.current = '';
        } else if (data === '\x7f' || data === '\x08') {
          // Backspace
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        } else if (data === '\x15') {
          // Ctrl+U: clear line
          inputBufferRef.current = '';
        } else if (data === '\x17') {
          // Ctrl+W: delete last word
          inputBufferRef.current = inputBufferRef.current.replace(/\s*\S+\s*$/, '');
        } else if (data === '\x03' || data === '\x1c') {
          // Ctrl+C / Ctrl+\: cancel
          inputBufferRef.current = '';
        } else if (data.startsWith('\x1b')) {
          // ESC sequences (arrow keys, etc.) — can't track accurately, clear buffer
          inputBufferRef.current = '';
        } else if (data >= ' ') {
          // Printable character
          inputBufferRef.current += data;
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        scheduleFitAndResize();
      });

      resizeObserver.observe(containerRef.current);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;
      initializedRef.current = true;

      return () => {
        containerRef.current?.removeEventListener('paste', handlePaste, { capture: true });
        dataDisposable.dispose();
        resizeObserver.disconnect();
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        if (writeFrameRef.current !== null) {
          window.cancelAnimationFrame(writeFrameRef.current);
          writeFrameRef.current = null;
        }
        pendingOutputRef.current = '';
        lastSizeRef.current = null;
        inputBufferRef.current = '';
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
        searchAddonRef.current = null;
        initializedRef.current = false;
      };
    }, [scheduleFitAndResize]);

    useEffect(() => {
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }

      // Reset reconnect state for this session
      intentionalCloseRef.current = false;
      everConnectedRef.current = false;
      reconnectAttemptRef.current = 0;

      terminal.clear();
      terminal.writeln(`Connecting to ${session.username}@${session.host}:${session.port} ...`);

      const websocketUrl = buildTerminalWebSocketUrl();

      function connectWebSocket(term: Terminal) {
        const ws = new WebSocket(websocketUrl);
        websocketRef.current = ws;
        reportStatusChange('connecting');

        ws.addEventListener('open', () => {
          ws.send(
            JSON.stringify({
              type: 'connect',
              payload: {
                nodeId: session.nodeId,
                host: session.host,
                port: session.port,
                username: session.username,
                password: session.password,
                privateKey: session.privateKey,
                passphrase: session.passphrase,
                cols: term.cols,
                rows: term.rows,
              },
            })
          );
        });

        ws.addEventListener('message', (event) => {
          const message = JSON.parse(event.data as string) as ServerMessage;

          if (message.type === 'data') {
            queueTerminalOutput(message.payload);
            return;
          }

          if (message.type === 'status') {
            if (message.payload.state === 'connected') {
              everConnectedRef.current = true;
              reconnectAttemptRef.current = 0;
              lastSizeRef.current = null;
              scheduleFitAndResize();
            }
            if (message.payload.state === 'closed') {
              term.writeln('\r\n[session closed]');
            }
            reportStatusChange(message.payload.state);
            return;
          }

          reportStatusChange('error', message.payload.message);
          term.writeln(`\r\n[error] ${message.payload.message}`);
        });

        ws.addEventListener('close', () => {
          // Intentional close (user closed tab) or initial connection failed — no retry
          if (intentionalCloseRef.current || !everConnectedRef.current) {
            reportStatusChange('closed');
            return;
          }

          const attempt = reconnectAttemptRef.current;
          if (attempt >= MAX_RECONNECT_ATTEMPTS) {
            term.writeln('\r\n\x1b[33m[断开] 重连失败，已达最大重试次数。\x1b[0m');
            reportStatusChange('error', '重连失败，请手动重新连接。');
            return;
          }

          const delayMs = RECONNECT_DELAYS_MS[attempt] ?? 30000;
          const delaySec = Math.round(delayMs / 1000);
          term.writeln(
            `\r\n\x1b[33m[断开] ${delaySec}s 后自动重连... (${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})\x1b[0m`
          );
          reportStatusChange('reconnecting');

          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            reconnectAttemptRef.current = attempt + 1;
            term.writeln('\x1b[33m[重连中]\x1b[0m');
            connectWebSocket(term);
          }, delayMs);
        });

        ws.addEventListener('error', () => {
          // Only report error directly if we never reached 'connected'.
          // If we were connected before, the 'close' event fires next and handles retry.
          if (!everConnectedRef.current) {
            reportStatusChange('error', `终端连接失败 (${websocketUrl})`);
            term.writeln(`\r\n\x1b[31m[error] 终端连接失败\x1b[0m`);
          }
        });
      }

      connectWebSocket(terminal);

      return () => {
        intentionalCloseRef.current = true;
        if (reconnectTimerRef.current !== null) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        websocketRef.current?.close();
        websocketRef.current = null;
      };
    }, [
      queueTerminalOutput,
      scheduleFitAndResize,
      session.host,
      session.id,
      session.nodeId,
      session.passphrase,
      session.password,
      session.port,
      session.privateKey,
      session.username,
    ]);

    useEffect(() => {
      if (!active) {
        return;
      }

      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;
      if (!terminal || !fitAddon) {
        return;
      }

      lastSizeRef.current = null;
      scheduleFitAndResize();
      terminal.focus();
    }, [active, scheduleFitAndResize]);

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
          <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-lg border border-[var(--app-border-strong)] bg-[#1e2025] px-2 py-1.5 shadow-xl">
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.shiftKey ? findPrev() : findNext();
                }
                if (e.key === 'Escape') {
                  closeSearch();
                }
              }}
              placeholder="搜索..."
              className="w-44 bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-600"
            />
            <button
              type="button"
              onClick={findPrev}
              title="上一个 (Shift+Enter)"
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={findNext}
              title="下一个 (Enter)"
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={closeSearch}
              title="关闭 (Esc)"
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
            >
              ×
            </button>
          </div>
        )}

        {pendingPaste !== null && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
            <div className="w-[480px] rounded-xl border border-[var(--app-border-strong)] bg-[#1e2025] p-5 shadow-2xl">
              <h3 className="mb-2 text-[14px] font-semibold text-neutral-100">粘贴多行内容</h3>
              <p className="mb-3 text-[12px] text-neutral-400">
                即将粘贴 {pendingPaste.split('\n').length} 行内容，确认继续？
              </p>
              <pre className="mb-4 max-h-40 overflow-auto rounded-md bg-neutral-900 p-3 text-[12px] text-neutral-300 whitespace-pre-wrap break-all">
                {pendingPaste.length > 500 ? pendingPaste.slice(0, 500) + '...' : pendingPaste}
              </pre>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingPaste(null)}
                  className="rounded-md px-3 py-1.5 text-[13px] text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ws = websocketRef.current;
                    if (ws?.readyState === WebSocket.OPEN) {
                      ws.send(JSON.stringify({ type: 'input', payload: pendingPaste }));
                    }
                    setPendingPaste(null);
                  }}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-[13px] text-white hover:bg-blue-500"
                >
                  确认粘贴
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
