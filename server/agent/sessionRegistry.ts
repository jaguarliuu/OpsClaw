type SessionStatus = 'connecting' | 'connected' | 'closed' | 'error';

import { logSession } from './logger.js';

export type RegisteredSessionSummary = {
  sessionId: string;
  nodeId: string | null;
  host: string;
  port: number;
  username: string;
  status: SessionStatus;
  connectedAt: number | null;
};

type PendingExecutionState =
  | 'running'
  | 'awaiting_human_input'
  | 'suspended_waiting_for_input'
  | 'completed'
  | 'failed';

type PendingExecution = {
  state: PendingExecutionState;
  command: string;
  startedAt: number;
  startMarker: string;
  endMarkerPrefix: string;
  buffer: string;
  captureStarted: boolean;
  resolve: (result: SessionCommandResult) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
  maxOutputChars: number;
  cleanupAbortListener: (() => void) | null;
  humanInputTimeoutMs: number;
  humanInputDetectedAt: number | null;
  pendingUserInputLine: string;
  redactedUserInputLines: string[];
};

type SessionEntry = RegisteredSessionSummary & {
  sendInput: (payload: string) => void;
  transcript: string;
  pendingExecution: PendingExecution | null;
  lastError?: string;
};

export type RegisterSessionInput = {
  sessionId: string;
  nodeId?: string;
  host: string;
  port: number;
  username: string;
  sendInput: (payload: string) => void;
};

export type SessionCommandResult = {
  sessionId: string;
  command: string;
  output: string;
  exitCode: number;
  truncated: boolean;
  startedAt: number;
  completedAt: number;
  durationMs: number;
};

const MAX_TRANSCRIPT_LENGTH = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_HUMAN_INPUT_TIMEOUT_MS = 300_000;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeUserInputChunk(value: string) {
  return value.replace(/\r/g, '\n');
}

function redactManualInputLines(output: string, userInputLines: string[]) {
  let nextOutput = output;

  for (const inputLine of userInputLines) {
    const normalizedLine = inputLine.trim();
    if (!normalizedLine) {
      continue;
    }

    const linePattern = new RegExp(
      `(^|\\r?\\n)${escapeRegExp(normalizedLine)}(?=\\r?\\n|$)`,
      'g'
    );

    nextOutput = nextOutput.replace(linePattern, (_match, prefix: string) => {
      return `${prefix}[用户输入已省略]`;
    });

    nextOutput = nextOutput.replace(
      new RegExp(escapeRegExp(normalizedLine), 'g'),
      '[用户输入已省略]'
    );
  }

  return nextOutput;
}

function stripAnsi(value: string) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    ''
  );
}

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

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionEntry>();

  private schedulePendingExecutionTimeout(
    session: SessionEntry,
    pendingExecution: PendingExecution,
    timeoutMs: number,
    errorMessage: string,
    logEvent: string,
    mode: 'reject' | 'suspend' = 'reject'
  ) {
    if (pendingExecution.timeoutId) {
      clearTimeout(pendingExecution.timeoutId);
    }
    pendingExecution.timeoutId = setTimeout(() => {
      const activeSession = this.sessions.get(session.sessionId);
      if (
        !activeSession?.pendingExecution ||
        activeSession.pendingExecution.startMarker !== pendingExecution.startMarker
      ) {
        return;
      }

      if (mode === 'suspend') {
        pendingExecution.timeoutId = null;
        pendingExecution.state = 'suspended_waiting_for_input';
        logSession(logEvent, {
          sessionId: activeSession.sessionId,
          command: pendingExecution.command,
          startMarker: pendingExecution.startMarker,
          humanInputDetected: pendingExecution.humanInputDetectedAt !== null,
        });
        return;
      }

      this.clearPendingExecution(activeSession, errorMessage, {
        logEvent,
        logData: {
          humanInputDetected: pendingExecution.humanInputDetectedAt !== null,
        },
      });
    }, timeoutMs);
  }

  private clearPendingExecution(
    session: SessionEntry,
    errorMessage: string,
    options?: {
      sendInterrupt?: boolean;
      logEvent?: string;
      logData?: Record<string, unknown>;
    }
  ) {
    const pendingExecution = session.pendingExecution;
    if (!pendingExecution) {
      return false;
    }

    if (pendingExecution.timeoutId) {
      clearTimeout(pendingExecution.timeoutId);
    }
    pendingExecution.cleanupAbortListener?.();
    pendingExecution.state = 'failed';
    session.pendingExecution = null;

    if (options?.sendInterrupt) {
      session.sendInput('\u0003');
    }

    if (options?.logEvent) {
      logSession(options.logEvent, {
        sessionId: session.sessionId,
        command: pendingExecution.command,
        startMarker: pendingExecution.startMarker,
        ...options.logData,
      });
    }

    pendingExecution.reject(new Error(errorMessage));
    return true;
  }

  private toSummary(session: SessionEntry): RegisteredSessionSummary {
    return {
      sessionId: session.sessionId,
      nodeId: session.nodeId,
      host: session.host,
      port: session.port,
      username: session.username,
      status: session.status,
      connectedAt: session.connectedAt,
    };
  }

  registerSession(input: RegisterSessionInput) {
    const existing = this.sessions.get(input.sessionId);
    logSession('register', {
      sessionId: input.sessionId,
      nodeId: input.nodeId ?? null,
      host: input.host,
      port: input.port,
      username: input.username,
      hasExistingSession: Boolean(existing),
    });

    if (existing?.pendingExecution) {
      this.clearPendingExecution(existing, '会话已重新连接，未完成的 Agent 命令已取消。');
    }

    this.sessions.set(input.sessionId, {
      sessionId: input.sessionId,
      nodeId: input.nodeId ?? null,
      host: input.host,
      port: input.port,
      username: input.username,
      status: 'connecting',
      connectedAt: null,
      sendInput: input.sendInput,
      transcript: '',
      pendingExecution: null,
    });
  }

  updateSessionStatus(sessionId: string, status: SessionStatus, errorMessage?: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logSession('status_ignored_missing_session', {
        sessionId,
        status,
        errorMessage,
      });
      return;
    }

    logSession('status_update', {
      sessionId,
      from: session.status,
      to: status,
      errorMessage,
    });
    session.status = status;
    session.lastError = errorMessage;
    if (status === 'connected' && !session.connectedAt) {
      session.connectedAt = Date.now();
    }

    if ((status === 'closed' || status === 'error') && session.pendingExecution) {
      this.clearPendingExecution(
        session,
        errorMessage ?? '连接已关闭，未完成的 Agent 命令已中断。'
      );
    }
  }

  unregisterSession(sessionId: string, errorMessage?: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logSession('unregister_ignored_missing_session', {
        sessionId,
        errorMessage,
      });
      return;
    }

    logSession('unregister', {
      sessionId,
      errorMessage,
      hadPendingExecution: Boolean(session.pendingExecution),
    });

    if (session.pendingExecution) {
      this.clearPendingExecution(session, errorMessage ?? '会话已断开，未完成的 Agent 命令已取消。');
    }

    this.sessions.delete(sessionId);
  }

  appendTerminalData(sessionId: string, chunk: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logSession('terminal_data_ignored_missing_session', {
        sessionId,
        chunkLength: chunk.length,
      });
      return;
    }

    if (session.pendingExecution) {
      logSession('terminal_data_received_for_pending_execution', {
        sessionId,
        chunkLength: chunk.length,
      });
    }

    const nextTranscript = session.transcript + chunk;
    session.transcript =
      nextTranscript.length > MAX_TRANSCRIPT_LENGTH
        ? nextTranscript.slice(-MAX_TRANSCRIPT_LENGTH)
        : nextTranscript;

    this.processPendingExecutionChunk(session, chunk);
  }

  noteUserInput(sessionId: string, payload: string) {
    const session = this.sessions.get(sessionId);
    if (!session?.pendingExecution || !payload) {
      return;
    }

    const pendingExecution = session.pendingExecution;
    const normalizedPayload = normalizeUserInputChunk(payload);

    if (pendingExecution.humanInputDetectedAt === null) {
      pendingExecution.humanInputDetectedAt = Date.now();
      if (pendingExecution.state === 'running') {
        pendingExecution.state = 'awaiting_human_input';
      }
      logSession('execute_command_human_input_detected', {
        sessionId,
        command: pendingExecution.command,
        startMarker: pendingExecution.startMarker,
      });
    }

    for (const char of normalizedPayload) {
      if (char === '\n') {
        const completedLine = pendingExecution.pendingUserInputLine.trim();
        if (completedLine) {
          pendingExecution.redactedUserInputLines.push(completedLine);
        }
        pendingExecution.pendingUserInputLine = '';
        continue;
      }

      if (char === '\b' || char === '\u007f') {
        pendingExecution.pendingUserInputLine = pendingExecution.pendingUserInputLine.slice(0, -1);
        continue;
      }

      const charCode = char.charCodeAt(0);
      if (charCode <= 0x1f) {
        continue;
      }

      pendingExecution.pendingUserInputLine += char;
    }

    if (pendingExecution.state === 'suspended_waiting_for_input') {
      return;
    }

    if (pendingExecution.state === 'running') {
      pendingExecution.state = 'awaiting_human_input';
    }

    this.schedulePendingExecutionTimeout(
      session,
      pendingExecution,
      pendingExecution.humanInputTimeoutMs,
      '命令等待人工输入超时，Agent 已停止等待结果。',
      'execute_command_human_input_suspended',
      'suspend'
    );
  }

  listSessions(): RegisteredSessionSummary[] {
    return Array.from(this.sessions.values()).map((session) => this.toSummary(session));
  }

  getSession(sessionId: string): RegisteredSessionSummary | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return this.toSummary(session);
  }

  getPendingExecutionDebug(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session?.pendingExecution) {
      return null;
    }

    return {
      state: session.pendingExecution.state,
      command: session.pendingExecution.command,
      startMarker: session.pendingExecution.startMarker,
    };
  }

  resumePendingExecutionWait(sessionId: string, timeoutMs: number) {
    const session = this.sessions.get(sessionId);
    if (!session?.pendingExecution) {
      throw new Error('当前会话没有等待中的命令。');
    }

    if (session.pendingExecution.state !== 'suspended_waiting_for_input') {
      throw new Error('当前命令不处于可恢复的等待状态。');
    }

    session.pendingExecution.state = 'awaiting_human_input';
    session.pendingExecution.humanInputTimeoutMs = timeoutMs;
    this.schedulePendingExecutionTimeout(
      session,
      session.pendingExecution,
      timeoutMs,
      '命令等待人工输入超时，Agent 已停止等待结果。',
      'execute_command_human_input_suspended',
      'suspend'
    );
  }

  getTranscript(sessionId: string, maxChars?: number) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('目标会话不存在或已断开。');
    }

    const transcript = stripAnsi(session.transcript);
    if (!maxChars || transcript.length <= maxChars) {
      return {
        sessionId,
        transcript,
        truncated: false,
      };
    }

    return {
      sessionId,
      transcript: transcript.slice(-maxChars),
      truncated: true,
    };
  }

  async executeCommand(
    sessionId: string,
    command: string,
    options?: {
      timeoutMs?: number;
      maxOutputChars?: number;
      signal?: AbortSignal;
      humanInputTimeoutMs?: number;
    }
  ): Promise<SessionCommandResult> {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      throw new Error('命令不能为空。');
    }

    if (options?.signal?.aborted) {
      throw new Error('Agent 已停止，命令未执行。');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('目标会话不存在或尚未建立连接。');
    }

    if (session.status !== 'connected') {
      logSession('execute_command_rejected_not_connected', {
        sessionId,
        status: session.status,
        command: trimmedCommand,
      });
      throw new Error('当前会话未连接，无法执行命令。');
    }

    if (session.pendingExecution) {
      logSession('execute_command_rejected_busy', {
        sessionId,
        command: trimmedCommand,
      });
      throw new Error('当前会话已有命令正在由 Agent 执行。');
    }

    const markerId = crypto.randomUUID().replace(/-/g, '');
    const startMarker = `__OPSCLAW_CMD_START_${markerId}__`;
    const endMarkerPrefix = `__OPSCLAW_CMD_END_${markerId}__:`;
    const startedAt = Date.now();

    return new Promise<SessionCommandResult>((resolve, reject) => {
      logSession('execute_command_started', {
        sessionId,
        command: trimmedCommand,
        timeoutMs: options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
        humanInputTimeoutMs: options?.humanInputTimeoutMs ?? DEFAULT_HUMAN_INPUT_TIMEOUT_MS,
        maxOutputChars: Math.max(1000, options?.maxOutputChars ?? 4000),
      });
      const timeoutId = setTimeout(() => {}, options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS);
      clearTimeout(timeoutId);

      const handleAbort = () => {
        const activeSession = this.sessions.get(sessionId);
        if (!activeSession?.pendingExecution || activeSession.pendingExecution.startMarker !== startMarker) {
          return;
        }

        this.clearPendingExecution(activeSession, 'Agent 已停止等待当前命令结果。', {
          sendInterrupt: true,
          logEvent: 'execute_command_aborted',
        });
      };

      if (options?.signal) {
        options.signal.addEventListener('abort', handleAbort, { once: true });
      }

      session.pendingExecution = {
        state: 'running',
        command: trimmedCommand,
        startedAt,
        startMarker,
        endMarkerPrefix,
        buffer: '',
        captureStarted: false,
        resolve,
        reject,
        timeoutId,
        maxOutputChars: Math.max(1000, options?.maxOutputChars ?? 4000),
        cleanupAbortListener: options?.signal
          ? () => {
              options.signal?.removeEventListener('abort', handleAbort);
            }
          : null,
        humanInputTimeoutMs: options?.humanInputTimeoutMs ?? DEFAULT_HUMAN_INPUT_TIMEOUT_MS,
        humanInputDetectedAt: null,
        pendingUserInputLine: '',
        redactedUserInputLines: [],
      };

      this.schedulePendingExecutionTimeout(
        session,
        session.pendingExecution,
        options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
        '命令执行超时，Agent 已停止等待结果。',
        'execute_command_timeout'
      );

      session.sendInput(
        `printf '\\n${startMarker}\\n'\n` +
          `${trimmedCommand}\n` +
          `__opsclaw_agent_status=$?\n` +
          `printf '\\n${endMarkerPrefix}%s\\n' "$__opsclaw_agent_status"\n`
      );
      logSession('execute_command_payload_sent', {
        sessionId,
        command: trimmedCommand,
        startMarker,
        endMarkerPrefix,
      });
    });
  }

  private processPendingExecutionChunk(session: SessionEntry, chunk: string) {
    const pendingExecution = session.pendingExecution;
    if (!pendingExecution) {
      return;
    }

    pendingExecution.buffer += chunk;

    if (!pendingExecution.captureStarted) {
      const startIndex = pendingExecution.buffer.indexOf(pendingExecution.startMarker);
      if (startIndex === -1) {
        pendingExecution.buffer = pendingExecution.buffer.slice(-pendingExecution.startMarker.length);
        return;
      }

      logSession('command_capture_started', {
        sessionId: session.sessionId,
        command: pendingExecution.command,
        startMarker: pendingExecution.startMarker,
        bufferLength: pendingExecution.buffer.length,
      });
      pendingExecution.captureStarted = true;
      pendingExecution.buffer = pendingExecution.buffer.slice(
        startIndex + pendingExecution.startMarker.length
      );
    }

    const markerMatch = findCompletedEndMarker(
      pendingExecution.buffer,
      pendingExecution.endMarkerPrefix
    );
    if (!markerMatch) {
      return;
    }

    if (pendingExecution.timeoutId) {
      clearTimeout(pendingExecution.timeoutId);
    }
    pendingExecution.cleanupAbortListener?.();
    pendingExecution.state = 'completed';
    session.pendingExecution = null;

    const completedAt = Date.now();
    const rawOutput = stripAnsi(pendingExecution.buffer.slice(0, markerMatch.endIndex)).trim();
    const sanitizedOutput = redactManualInputLines(
      rawOutput,
      pendingExecution.redactedUserInputLines
    );
    const truncated = sanitizedOutput.length > pendingExecution.maxOutputChars;
    const output = truncated
      ? `${sanitizedOutput.slice(0, pendingExecution.maxOutputChars)}\n...[输出已截断]`
      : sanitizedOutput;

    logSession('execute_command_completed', {
      sessionId: session.sessionId,
      command: pendingExecution.command,
      exitCode: markerMatch.exitCode,
      durationMs: completedAt - pendingExecution.startedAt,
      truncated,
      outputPreview: output.slice(0, 200),
    });

    pendingExecution.resolve({
      sessionId: session.sessionId,
      command: pendingExecution.command,
      exitCode: markerMatch.exitCode,
      output,
      truncated,
      startedAt: pendingExecution.startedAt,
      completedAt,
      durationMs: completedAt - pendingExecution.startedAt,
    });
  }
}
