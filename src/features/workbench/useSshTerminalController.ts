import { useCallback, useRef, type MutableRefObject, type RefObject } from 'react';

import { recordCommand } from '@/features/workbench/api';
import {
  buildExecuteCommandPayload,
  COMMAND_EXECUTION_TIMEOUT_MS,
  consumePendingExecutionBuffer,
  createPendingExecutionCaptureState,
  createTerminalCommandMarkers,
  type PendingExecutionCaptureState,
} from '@/features/workbench/sshTerminalCommandExecutionModel';
import {
  canSendSshTerminalCommand,
  getSshTerminalExecuteCommandError,
  normalizeSshTerminalCommand,
} from '@/features/workbench/sshTerminalControllerModel';
import type { LiveSession, TerminalCommandExecutionResult } from '@/features/workbench/types';
import { stripAnsi } from '@/lib/utils';

type PendingExecution = PendingExecutionCaptureState & {
  resolve: (result: TerminalCommandExecutionResult) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type UseSshTerminalControllerOptions = {
  containerRef: RefObject<HTMLDivElement | null>;
  session: LiveSession;
  terminalRef: MutableRefObject<{ clear: () => void; write: (data: string) => void } | null>;
  transcriptRef: MutableRefObject<string>;
  websocketRef: MutableRefObject<WebSocket | null>;
};

type SshTerminalControllerHandle = {
  clear: () => void;
  copyVisibleContent: () => void;
  sendCommand: (command: string) => void;
  executeCommand: (command: string) => Promise<TerminalCommandExecutionResult>;
  getTranscript: () => string;
};

export function useSshTerminalController({
  containerRef,
  session,
  terminalRef,
  transcriptRef,
  websocketRef,
}: UseSshTerminalControllerOptions) {
  const pendingExecutionRef = useRef<PendingExecution | null>(null);

  const rejectPendingExecution = useCallback((message: string) => {
    const pendingExecution = pendingExecutionRef.current;
    if (!pendingExecution) {
      return;
    }

    clearTimeout(pendingExecution.timeoutId);
    pendingExecutionRef.current = null;
    pendingExecution.reject(new Error(message));
  }, []);

  const processPendingExecutionChunk = useCallback((chunk: string) => {
    const pendingExecution = pendingExecutionRef.current;
    if (!pendingExecution) {
      return;
    }

    const result = consumePendingExecutionBuffer(pendingExecution, chunk, Date.now());

    if (!result.result) {
      pendingExecutionRef.current = {
        ...pendingExecution,
        ...result.pendingExecution,
      };
      return;
    }

    clearTimeout(pendingExecution.timeoutId);
    pendingExecutionRef.current = null;
    pendingExecution.resolve(result.result);
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, [terminalRef]);

  const copyVisibleContent = useCallback(() => {
    const text = containerRef.current?.textContent ?? '';
    if (text) {
      void navigator.clipboard.writeText(text);
    }
  }, [containerRef]);

  const sendCommand = useCallback((command: string) => {
    const normalizedCommand = normalizeSshTerminalCommand(command);
    const websocket = websocketRef.current;

    if (!canSendSshTerminalCommand(normalizedCommand, websocket?.readyState)) {
      return;
    }
    if (!websocket) {
      return;
    }

    websocket.send(JSON.stringify({ type: 'input', payload: `${normalizedCommand}\n` }));
    void recordCommand({ command: normalizedCommand, nodeId: session.nodeId });
  }, [session.nodeId, websocketRef]);

  const executeCommand = useCallback((command: string) => {
    const normalizedCommand = normalizeSshTerminalCommand(command);
    const websocket = websocketRef.current;
    const errorMessage = getSshTerminalExecuteCommandError({
      hasPendingExecution: pendingExecutionRef.current !== null,
      normalizedCommand,
      websocketReadyState: websocket?.readyState,
    });

    if (errorMessage) {
      return Promise.reject(new Error(errorMessage));
    }

    const markers = createTerminalCommandMarkers(
      crypto.randomUUID().replace(/-/g, '')
    );
    const startedAt = Date.now();

    return new Promise<TerminalCommandExecutionResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (pendingExecutionRef.current?.startMarker !== markers.startMarker) {
          return;
        }

        pendingExecutionRef.current = null;
        reject(new Error('命令执行超时，Agent 已停止等待结果。'));
      }, COMMAND_EXECUTION_TIMEOUT_MS);

      pendingExecutionRef.current = {
        ...createPendingExecutionCaptureState(normalizedCommand, startedAt, markers),
        reject,
        resolve,
        timeoutId,
      };

      websocket?.send(
        JSON.stringify({
          type: 'input',
          payload: buildExecuteCommandPayload(normalizedCommand, markers),
        })
      );
    });
  }, [websocketRef]);

  const getTranscript = useCallback(() => {
    return stripAnsi(transcriptRef.current);
  }, [transcriptRef]);

  const controllerHandle: SshTerminalControllerHandle = {
    clear,
    copyVisibleContent,
    executeCommand,
    getTranscript,
    sendCommand,
  };

  return {
    controllerHandle,
    processPendingExecutionChunk,
    rejectPendingExecution,
  };
}
