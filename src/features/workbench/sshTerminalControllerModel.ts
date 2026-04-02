const OPEN_WEBSOCKET_READY_STATE = 1;

export function normalizeSshTerminalCommand(command: string) {
  return command.trim();
}

export function canSendSshTerminalCommand(
  normalizedCommand: string,
  websocketReadyState: number | undefined
) {
  return normalizedCommand !== '' && websocketReadyState === OPEN_WEBSOCKET_READY_STATE;
}

export function getSshTerminalExecuteCommandError(input: {
  hasPendingExecution: boolean;
  normalizedCommand: string;
  websocketReadyState: number | undefined;
}) {
  if (input.normalizedCommand === '') {
    return '命令不能为空。';
  }

  if (input.hasPendingExecution) {
    return '当前会话已有命令正在由 Agent 执行。';
  }

  if (input.websocketReadyState !== OPEN_WEBSOCKET_READY_STATE) {
    return '当前会话未连接，无法执行命令。';
  }

  return null;
}
