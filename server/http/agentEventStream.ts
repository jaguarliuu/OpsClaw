type EventStreamRequest = {
  on: (event: 'aborted', handler: () => void) => void;
};

type EventStreamResponse = {
  setHeader: (name: string, value: string) => void;
  flushHeaders?: () => void;
  write: (chunk: string) => void;
  end: () => void;
  on: (event: 'close', handler: () => void) => void;
};

export function serializeSseEvent(event: unknown) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function createAgentEventStream(
  request: EventStreamRequest,
  response: EventStreamResponse
) {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders?.();

  const abortController = new AbortController();
  let closed = false;

  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    response.end();
  };

  request.on('aborted', () => {
    if (!closed) {
      abortController.abort();
    }
  });

  response.on('close', () => {
    if (!closed) {
      abortController.abort();
    }
  });

  return {
    signal: abortController.signal,
    emit(event: unknown) {
      response.write(serializeSseEvent(event));
    },
    close,
  };
}
