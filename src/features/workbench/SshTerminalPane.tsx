import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

import { buildTerminalWebSocketUrl } from '@/features/workbench/terminalSocket';
import { useTerminalSettings } from '@/features/workbench/TerminalSettingsContext';
import { TERMINAL_THEMES } from '@/features/workbench/terminalSettings';
import type { ConnectionStatus, LiveSession } from '@/features/workbench/types';

type ServerMessage =
  | { type: 'status'; payload: { state: 'connecting' | 'connected' | 'closed' } }
  | { type: 'data'; payload: string }
  | { type: 'error'; payload: { message: string } };

type SshTerminalPaneProps = {
  session: LiveSession;
  active: boolean;
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
  function SshTerminalPane({ session, active, onStatusChange }, ref) {
    const { settings } = useTerminalSettings();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
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

      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();
      terminal.focus();

      const dataDisposable = terminal.onData((data) => {
        const websocket = websocketRef.current;
        if (websocket?.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: 'input', payload: data }));
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        scheduleFitAndResize();
      });

      resizeObserver.observe(containerRef.current);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      initializedRef.current = true;

      return () => {
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
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
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
      <div
        className={active ? 'xterm-pane block h-full w-full' : 'xterm-pane hidden h-full w-full'}
        ref={containerRef}
      />
    );
  }
);
