import { useCallback, useRef, type MutableRefObject } from 'react';

import {
  buildSshTerminalResizeMessage,
  shouldSendSshTerminalResize,
} from '@/features/workbench/sshTerminalViewportModel';

type TerminalViewport = {
  cols: number;
  rows: number;
  write: (data: string) => void;
};

type TerminalViewportFitAddon = {
  fit: () => void;
};

type UseSshTerminalViewportOptions = {
  fitAddonRef: MutableRefObject<TerminalViewportFitAddon | null>;
  terminalRef: MutableRefObject<TerminalViewport | null>;
  websocketRef: MutableRefObject<WebSocket | null>;
};

export function useSshTerminalViewport({
  fitAddonRef,
  terminalRef,
  websocketRef,
}: UseSshTerminalViewportOptions) {
  const resizeFrameRef = useRef<number | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const writeFrameRef = useRef<number | null>(null);
  const pendingOutputRef = useRef('');

  const flushTerminalOutput = useCallback(() => {
    const terminal = terminalRef.current;
    const pendingOutput = pendingOutputRef.current;

    writeFrameRef.current = null;

    if (!terminal || !pendingOutput) {
      return;
    }

    pendingOutputRef.current = '';
    terminal.write(pendingOutput);
  }, [terminalRef]);

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

    if (!terminal || !websocket) {
      return;
    }

    const nextSize = {
      cols: terminal.cols,
      rows: terminal.rows,
    };

    if (
      !shouldSendSshTerminalResize({
        lastSize: lastSizeRef.current,
        nextSize,
        websocketReadyState: websocket.readyState,
      })
    ) {
      return;
    }

    lastSizeRef.current = nextSize;
    websocket.send(JSON.stringify(buildSshTerminalResizeMessage(nextSize)));
  }, [terminalRef, websocketRef]);

  const scheduleFitAndResize = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      return;
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      fitAddonRef.current?.fit();
      sendResize();
    });
  }, [fitAddonRef, sendResize]);

  const resetViewportSize = useCallback(() => {
    lastSizeRef.current = null;
  }, []);

  const disposeViewport = useCallback(() => {
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
  }, []);

  return {
    disposeViewport,
    queueTerminalOutput,
    resetViewportSize,
    scheduleFitAndResize,
    sendResize,
  };
}
