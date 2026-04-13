export type WorkbenchPrimaryViewState = {
  mode: 'terminal' | 'sftp';
  nodeId: string | null;
  sessionId: string | null;
};

export function buildTerminalPrimaryViewState(input: {
  nodeId: string | null;
  sessionId: string | null;
}): WorkbenchPrimaryViewState {
  return {
    mode: 'terminal',
    nodeId: input.nodeId,
    sessionId: input.sessionId,
  };
}

export function buildOpenSftpViewState(
  current: WorkbenchPrimaryViewState,
  input: { nodeId: string; sessionId?: string | null }
): WorkbenchPrimaryViewState {
  return {
    mode: 'sftp',
    nodeId: input.nodeId,
    sessionId: input.sessionId ?? current.sessionId,
  };
}

export function closeSftpView(
  current: WorkbenchPrimaryViewState
): WorkbenchPrimaryViewState {
  return {
    mode: 'terminal',
    nodeId: current.nodeId,
    sessionId: current.sessionId,
  };
}
