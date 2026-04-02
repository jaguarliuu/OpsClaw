import { useEffect, type MutableRefObject } from 'react';
import type { Terminal } from '@xterm/xterm';

import { buildTerminalWebSocketUrl } from '@/features/workbench/terminalSocket';
import {
  buildTerminalConnectMessage,
  buildTerminalConnectingNotice,
  buildTerminalReconnectNotice,
  getTerminalReconnectDelayMs,
  mapTerminalServerStatusToConnectionStatus,
  shouldOpenSshTerminalConnection,
  shouldReconnectTerminalSession,
  shouldReportTerminalSocketError,
  type TerminalServerMessage,
} from '@/features/workbench/sshTerminalConnectionModel';
import type { ConnectionStatus, LiveSession } from '@/features/workbench/types';

function logSshTerminalConnection(event: string, details: Record<string, unknown> = {}) {
  console.info(`[SshTerminalConnection] ${event}`, details);
}

type UseSshTerminalConnectionOptions = {
  appendTranscript: (chunk: string) => void;
  everConnectedRef: MutableRefObject<boolean>;
  intentionalCloseRef: MutableRefObject<boolean>;
  isRuntimeReady: boolean;
  maxReconnectAttempts: number;
  processPendingExecutionChunk: (chunk: string) => void;
  queueTerminalOutput: (chunk: string) => void;
  reconnectAttemptRef: MutableRefObject<number>;
  reconnectDelaysMs: readonly number[];
  reconnectTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  rejectPendingExecution: (message: string) => void;
  reportStatusChange: (status: ConnectionStatus, errorMessage?: string) => void;
  resetViewportSize: () => void;
  scheduleFitAndResize: () => void;
  session: LiveSession;
  terminalRef: MutableRefObject<Terminal | null>;
  websocketRef: MutableRefObject<WebSocket | null>;
};

export function useSshTerminalConnection({
  appendTranscript,
  everConnectedRef,
  intentionalCloseRef,
  isRuntimeReady,
  maxReconnectAttempts,
  processPendingExecutionChunk,
  queueTerminalOutput,
  reconnectAttemptRef,
  reconnectDelaysMs,
  reconnectTimerRef,
  rejectPendingExecution,
  reportStatusChange,
  resetViewportSize,
  scheduleFitAndResize,
  session,
  terminalRef,
  websocketRef,
}: UseSshTerminalConnectionOptions) {
  const {
    host,
    id,
    nodeId,
    passphrase,
    password,
    port,
    privateKey,
    username,
  } = session;

  useEffect(() => {
    const currentTerminal = terminalRef.current;
    const shouldOpenConnection = shouldOpenSshTerminalConnection({
      hasTerminal: currentTerminal !== null,
      isRuntimeReady,
    });

    logSshTerminalConnection('effect:enter', {
      sessionId: id,
      nodeId,
      host,
      port,
      username,
      hasTerminal: currentTerminal !== null,
      isRuntimeReady,
      shouldOpenConnection,
    });

    if (!shouldOpenConnection || currentTerminal === null) {
      return;
    }
    const terminal = currentTerminal;

    intentionalCloseRef.current = false;
    everConnectedRef.current = false;
    reconnectAttemptRef.current = 0;

    terminal.clear();
    terminal.writeln(buildTerminalConnectingNotice({ host, port, username }));

    const websocketUrl = buildTerminalWebSocketUrl();
    logSshTerminalConnection('ws:url', {
      sessionId: id,
      websocketUrl,
    });

    function connectWebSocket(term: Terminal) {
      const websocket = new WebSocket(websocketUrl);
      websocketRef.current = websocket;
      logSshTerminalConnection('ws:create', {
        sessionId: id,
        reconnectAttempt: reconnectAttemptRef.current,
      });
      reportStatusChange('connecting');

      websocket.addEventListener('open', () => {
        const connectMessage = buildTerminalConnectMessage(
          {
            host,
            id,
            nodeId,
            passphrase,
            password,
            port,
            privateKey,
            username,
          },
          {
            cols: term.cols,
            rows: term.rows,
          }
        );
        logSshTerminalConnection('ws:open', {
          sessionId: id,
          cols: term.cols,
          rows: term.rows,
          host,
          port,
          username,
          nodeId,
          hasPassword: Boolean(password),
          hasPrivateKey: Boolean(privateKey),
          hasPassphrase: Boolean(passphrase),
        });
        websocket.send(
          JSON.stringify(connectMessage)
        );
      });

      websocket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data as string) as TerminalServerMessage;
        if (message.type !== 'data') {
          logSshTerminalConnection('ws:message', {
            sessionId: id,
            messageType: message.type,
            payload: message.payload,
          });
        }

        if (message.type === 'data') {
          queueTerminalOutput(message.payload);
          appendTranscript(message.payload);
          processPendingExecutionChunk(message.payload);
          return;
        }

        if (message.type === 'status') {
          if (message.payload.state === 'connected') {
            everConnectedRef.current = true;
            reconnectAttemptRef.current = 0;
            resetViewportSize();
            scheduleFitAndResize();
          }

          if (message.payload.state === 'closed') {
            term.writeln('\r\n[session closed]');
          }

          reportStatusChange(
            mapTerminalServerStatusToConnectionStatus(message.payload.state)
          );
          return;
        }

        reportStatusChange('error', message.payload.message);
        rejectPendingExecution(message.payload.message);
        term.writeln(`\r\n[error] ${message.payload.message}`);
      });

      websocket.addEventListener('close', () => {
        logSshTerminalConnection('ws:close', {
          sessionId: id,
          everConnected: everConnectedRef.current,
          intentionalClose: intentionalCloseRef.current,
          reconnectAttempt: reconnectAttemptRef.current,
        });
        rejectPendingExecution('连接已关闭，未完成的 Agent 命令已中断。');

        const attempt = reconnectAttemptRef.current;
        const shouldReconnect = shouldReconnectTerminalSession({
          attempt,
          everConnected: everConnectedRef.current,
          intentionalClose: intentionalCloseRef.current,
          maxReconnectAttempts,
        });

        if (!shouldReconnect) {
          if (!intentionalCloseRef.current && everConnectedRef.current && attempt >= maxReconnectAttempts) {
            term.writeln('\r\n\x1b[33m[断开] 重连失败，已达最大重试次数。\x1b[0m');
            reportStatusChange('error', '重连失败，请手动重新连接。');
            return;
          }

          reportStatusChange('closed');
          return;
        }

        const delayMs = getTerminalReconnectDelayMs(reconnectDelaysMs, attempt);
        term.writeln(
          buildTerminalReconnectNotice({
            attempt,
            delayMs,
            maxReconnectAttempts,
          })
        );
        reportStatusChange('reconnecting');

        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          reconnectAttemptRef.current = attempt + 1;
          term.writeln('\x1b[33m[重连中]\x1b[0m');
          connectWebSocket(term);
        }, delayMs);
      });

      websocket.addEventListener('error', (event) => {
        console.error('[SshTerminalConnection] ws:error', {
          sessionId: id,
          websocketUrl,
          eventType: event.type,
        });
        if (!shouldReportTerminalSocketError(everConnectedRef.current)) {
          return;
        }

        rejectPendingExecution(`终端连接失败 (${websocketUrl})`);
        reportStatusChange('error', `终端连接失败 (${websocketUrl})`);
        term.writeln(`\r\n\x1b[31m[error] 终端连接失败\x1b[0m`);
      });
    }

    connectWebSocket(terminal);

    return () => {
      logSshTerminalConnection('effect:cleanup', {
        sessionId: id,
      });
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      websocketRef.current?.close();
      websocketRef.current = null;
    };
  }, [
    appendTranscript,
    everConnectedRef,
    intentionalCloseRef,
    isRuntimeReady,
    maxReconnectAttempts,
    processPendingExecutionChunk,
    queueTerminalOutput,
    reconnectAttemptRef,
    reconnectDelaysMs,
    reconnectTimerRef,
    rejectPendingExecution,
    reportStatusChange,
    resetViewportSize,
    scheduleFitAndResize,
    host,
    id,
    nodeId,
    passphrase,
    password,
    port,
    privateKey,
    terminalRef,
    username,
    websocketRef,
  ]);
}
