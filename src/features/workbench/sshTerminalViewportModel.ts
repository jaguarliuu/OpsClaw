const OPEN_WEBSOCKET_READY_STATE = 1;

export type SshTerminalViewportSize = {
  cols: number;
  rows: number;
};

export function shouldSendSshTerminalResize(input: {
  lastSize: SshTerminalViewportSize | null;
  nextSize: SshTerminalViewportSize;
  websocketReadyState: number | undefined;
}) {
  if (input.websocketReadyState !== OPEN_WEBSOCKET_READY_STATE) {
    return false;
  }

  const { lastSize, nextSize } = input;
  return lastSize === null || lastSize.cols !== nextSize.cols || lastSize.rows !== nextSize.rows;
}

export function buildSshTerminalResizeMessage(size: SshTerminalViewportSize) {
  return {
    type: 'resize' as const,
    payload: size,
  };
}
