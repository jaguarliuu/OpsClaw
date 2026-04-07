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

export type TerminalProtocolOutputFilterState = {
  pendingFragment: string;
};

const TERMINAL_PROTOCOL_FRAGMENT_STARTS = [
  "printf '\\n__OPSCLAW_CMD_START_",
  "printf '\\n__OPSCLAW_CMD_END_",
  '__OPSCLAW_CMD_START_',
  '__OPSCLAW_CMD_END_',
] as const;

const COMPLETE_TERMINAL_PROTOCOL_FRAGMENT_PATTERN =
  // eslint-disable-next-line no-control-regex
  /^(?:printf '\\n__OPSCLAW_CMD_START_[a-f0-9]+__\\n'(?:;\s*)?|(?:\s*;\s*)?printf '\\n__OPSCLAW_CMD_END_[a-f0-9]+__:%s\\n' "\$\?"|__OPSCLAW_CMD_START_[a-f0-9]+__|__OPSCLAW_CMD_END_[a-f0-9]+__:(?:\u001b\[[0-9;]*m)*-?\d+(?:\u001b\[[0-9;]*m)*)/;

const TERMINAL_PROTOCOL_FRAGMENT_PATTERNS = [
  /printf '\\n__OPSCLAW_CMD_START_[a-f0-9]+__\\n';\s*/g,
  /\s*;\s*printf '\\n__OPSCLAW_CMD_END_[a-f0-9]+__:%s\\n' "\$\?"/g,
  /printf '\\n__OPSCLAW_CMD_START_[a-f0-9]+__\\n'/g,
  /printf '\\n__OPSCLAW_CMD_END_[a-f0-9]+__:%s\\n' "\$\?"/g,
  /__OPSCLAW_CMD_START_[a-f0-9]+__/g,
  // eslint-disable-next-line no-control-regex
  /__OPSCLAW_CMD_END_[a-f0-9]+__:(?:\u001b\[[0-9;]*m)*-?\d+(?:\u001b\[[0-9;]*m)*/g,
] as const;

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

export function createTerminalProtocolOutputFilterState(): TerminalProtocolOutputFilterState {
  return {
    pendingFragment: '',
  };
}

function stripTerminalProtocolFragments(value: string) {
  return TERMINAL_PROTOCOL_FRAGMENT_PATTERNS.reduce((nextValue, pattern) => {
    return nextValue.replace(pattern, '');
  }, value);
}

function findLastTerminalProtocolFragmentStart(value: string) {
  return TERMINAL_PROTOCOL_FRAGMENT_STARTS.reduce((lastIndex, fragmentStart) => {
    return Math.max(lastIndex, value.lastIndexOf(fragmentStart));
  }, -1);
}

function findTrailingTerminalProtocolPrefixLength(value: string) {
  return TERMINAL_PROTOCOL_FRAGMENT_STARTS.reduce((maxLength, fragmentStart) => {
    const maxCandidateLength = Math.min(fragmentStart.length - 1, value.length);

    for (let length = maxCandidateLength; length > maxLength; length -= 1) {
      if (value.endsWith(fragmentStart.slice(0, length))) {
        return length;
      }
    }

    return maxLength;
  }, 0);
}

export function filterTerminalProtocolOutput(
  state: TerminalProtocolOutputFilterState,
  chunk: string
): {
  nextState: TerminalProtocolOutputFilterState;
  visibleChunk: string;
} {
  const nextBuffer = state.pendingFragment + chunk;
  const lastProtocolStart = findLastTerminalProtocolFragmentStart(nextBuffer);
  let pendingFragment = '';
  let visibleBuffer = nextBuffer;
  let pendingFragmentStartIndex = -1;

  if (lastProtocolStart !== -1) {
    const trailingFragment = nextBuffer.slice(lastProtocolStart);
    if (!COMPLETE_TERMINAL_PROTOCOL_FRAGMENT_PATTERN.test(trailingFragment)) {
      pendingFragmentStartIndex = lastProtocolStart;
    }
  }

  if (pendingFragmentStartIndex === -1) {
    const trailingPrefixLength = findTrailingTerminalProtocolPrefixLength(nextBuffer);
    if (trailingPrefixLength > 0) {
      pendingFragmentStartIndex = nextBuffer.length - trailingPrefixLength;
    }
  }

  if (pendingFragmentStartIndex !== -1) {
    pendingFragment = nextBuffer.slice(pendingFragmentStartIndex);
    visibleBuffer = nextBuffer.slice(0, pendingFragmentStartIndex);
  }

  return {
    nextState: {
      pendingFragment,
    },
    visibleChunk: stripTerminalProtocolFragments(visibleBuffer),
  };
}

export function buildExecuteCommandPayload(
  command: string,
  markers: TerminalCommandMarkers
) {
  const inlineCommand = command
    .split(/\r?\n/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('; ');

  return (
    `printf '\\n${markers.startMarker}\\n'; ` +
    `${inlineCommand}; ` +
    `printf '\\n${markers.endMarkerPrefix}%s\\n' "$?"\n`
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
