import type { TerminalCommandExecutionResult } from './types';
import { stripAnsi } from '../../lib/utils';

export const MAX_TERMINAL_TRANSCRIPT_LENGTH = 120_000;
export const COMMAND_EXECUTION_TIMEOUT_MS = 120_000;

export type TerminalCommandMarkers = {
  startMarker: string;
  endMarkerPrefix: string;
};

export type PendingExecutionCaptureState = {
  command: string;
  startedAt: number;
  startMarker: string;
  endMarkerPrefix: string;
  buffer: string;
  captureStarted: boolean;
};

function findCompletedEndMarker(buffer: string, endMarkerPrefix: string) {
  let searchIndex = buffer.lastIndexOf(endMarkerPrefix);

  while (searchIndex !== -1) {
    const trailing = stripAnsi(buffer.slice(searchIndex + endMarkerPrefix.length));
    const exitCodeMatch = trailing.match(/^\s*(-?\d+)(?:\r?\n|$)/);

    if (exitCodeMatch) {
      return {
        endIndex: searchIndex,
        exitCode: Number(exitCodeMatch[1]),
      };
    }

    searchIndex = buffer.lastIndexOf(endMarkerPrefix, searchIndex - 1);
  }

  return null;
}

export function createTerminalCommandMarkers(markerId: string): TerminalCommandMarkers {
  return {
    startMarker: `__OPSCLAW_CMD_START_${markerId}__`,
    endMarkerPrefix: `__OPSCLAW_CMD_END_${markerId}__:`,
  };
}

export function buildExecuteCommandPayload(
  command: string,
  markers: TerminalCommandMarkers
) {
  return (
    `printf '\\n${markers.startMarker}\\n'\n` +
    `${command}\n` +
    `__opsclaw_agent_status=$?\n` +
    `printf '\\n${markers.endMarkerPrefix}%s\\n' "$__opsclaw_agent_status"\n`
  );
}

export function appendTerminalTranscript(
  currentTranscript: string,
  chunk: string,
  maxLength = MAX_TERMINAL_TRANSCRIPT_LENGTH
) {
  const nextTranscript = currentTranscript + chunk;

  return nextTranscript.length > maxLength
    ? nextTranscript.slice(-maxLength)
    : nextTranscript;
}

export function createPendingExecutionCaptureState(
  command: string,
  startedAt: number,
  markers: TerminalCommandMarkers
): PendingExecutionCaptureState {
  return {
    buffer: '',
    captureStarted: false,
    command,
    endMarkerPrefix: markers.endMarkerPrefix,
    startMarker: markers.startMarker,
    startedAt,
  };
}

export function consumePendingExecutionBuffer(
  pendingExecution: PendingExecutionCaptureState,
  chunk: string,
  completedAt: number
): {
  pendingExecution: PendingExecutionCaptureState | null;
  result: TerminalCommandExecutionResult | null;
} {
  const nextPendingExecution = {
    ...pendingExecution,
    buffer: pendingExecution.buffer + chunk,
  };

  if (!nextPendingExecution.captureStarted) {
    const startIndex = nextPendingExecution.buffer.indexOf(nextPendingExecution.startMarker);

    if (startIndex === -1) {
      nextPendingExecution.buffer = nextPendingExecution.buffer.slice(
        -nextPendingExecution.startMarker.length
      );

      return {
        pendingExecution: nextPendingExecution,
        result: null,
      };
    }

    nextPendingExecution.captureStarted = true;
    nextPendingExecution.buffer = nextPendingExecution.buffer.slice(
      startIndex + nextPendingExecution.startMarker.length
    );
  }

  const markerMatch = findCompletedEndMarker(
    nextPendingExecution.buffer,
    nextPendingExecution.endMarkerPrefix
  );

  if (!markerMatch) {
    return {
      pendingExecution: nextPendingExecution,
      result: null,
    };
  }

  return {
    pendingExecution: null,
    result: {
      command: nextPendingExecution.command,
      completedAt,
      durationMs: completedAt - nextPendingExecution.startedAt,
      exitCode: markerMatch.exitCode,
      output: stripAnsi(nextPendingExecution.buffer.slice(0, markerMatch.endIndex)).trim(),
      startedAt: nextPendingExecution.startedAt,
    },
  };
}
