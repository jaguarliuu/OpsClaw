import type { ConnectionStatus } from './types';

type TerminalConnectionSession = {
  id: string;
  nodeId?: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
};

type TerminalConnectionNoticeSession = {
  host: string;
  port: number;
  username: string;
};

export type TerminalConnectMessage = {
  type: 'connect';
  payload: {
    sessionId: string;
    nodeId?: string;
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    cols: number;
    rows: number;
  };
};

export type TerminalServerMessage =
  | { type: 'status'; payload: { state: 'connecting' | 'connected' | 'closed' } }
  | { type: 'data'; payload: string }
  | { type: 'error'; payload: { message: string } };

export type TerminalReconnectPolicy = {
  attempt: number;
  everConnected: boolean;
  intentionalClose: boolean;
  maxReconnectAttempts: number;
};

export function buildTerminalConnectMessage(
  session: TerminalConnectionSession,
  size: { cols: number; rows: number }
): TerminalConnectMessage {
  return {
    type: 'connect',
    payload: {
      cols: size.cols,
      rows: size.rows,
      host: session.host,
      nodeId: session.nodeId,
      passphrase: session.passphrase,
      password: session.password,
      port: session.port,
      privateKey: session.privateKey,
      sessionId: session.id,
      username: session.username,
    },
  };
}

export function buildTerminalConnectingNotice(session: TerminalConnectionNoticeSession) {
  return `Connecting to ${session.username}@${session.host}:${session.port} ...`;
}

export function shouldReconnectTerminalSession({
  attempt,
  everConnected,
  intentionalClose,
  maxReconnectAttempts,
}: TerminalReconnectPolicy) {
  if (intentionalClose || !everConnected) {
    return false;
  }

  return attempt < maxReconnectAttempts;
}

export function getTerminalReconnectDelayMs(
  reconnectDelaysMs: readonly number[],
  attempt: number
) {
  return reconnectDelaysMs[attempt] ?? 30000;
}

export function buildTerminalReconnectNotice(input: {
  attempt: number;
  delayMs: number;
  maxReconnectAttempts: number;
}) {
  const delaySec = Math.round(input.delayMs / 1000);

  return `\r\n\x1b[33m[断开] ${delaySec}s 后自动重连... (${input.attempt + 1}/${input.maxReconnectAttempts})\x1b[0m`;
}

export function shouldReportTerminalSocketError(everConnected: boolean) {
  return !everConnected;
}

export function shouldOpenSshTerminalConnection(input: {
  hasTerminal: boolean;
  isRuntimeReady: boolean;
}) {
  return input.isRuntimeReady && input.hasTerminal;
}

export function mapTerminalServerStatusToConnectionStatus(
  state: 'connecting' | 'connected' | 'closed'
): ConnectionStatus {
  return state;
}
