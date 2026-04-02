import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

type FakeRequest = EventEmitter & {
  body: unknown;
};

type FakeResponse = EventEmitter & {
  headersSent: boolean;
  jsonPayload: unknown;
  statusCode: number;
  ended: boolean;
  setHeader(name: string, value: string): void;
  status(code: number): FakeResponse;
  json(payload: unknown): void;
  write(chunk: string): void;
  end(): void;
  flushHeaders?(): void;
};

function createFakeRequest(): FakeRequest {
  return Object.assign(new EventEmitter(), {
    body: {
      providerId: 'provider-1',
      model: 'qwen-plus',
      messages: [{ role: 'user', content: 'hello' }],
    },
  });
}

function createFakeResponse(): FakeResponse {
  const response = Object.assign(new EventEmitter(), {
    headersSent: false,
    jsonPayload: null as unknown,
    statusCode: 200,
    ended: false,
    setHeader(name: string, value: string) {
      void name;
      void value;
      this.headersSent = true;
    },
    status(this: FakeResponse, code: number) {
      this.statusCode = code;
      return this;
    },
    json(this: FakeResponse, payload: unknown) {
      this.headersSent = true;
      this.jsonPayload = payload;
    },
    write(this: FakeResponse, chunk: string) {
      void chunk;
      this.headersSent = true;
    },
    end(this: FakeResponse) {
      this.ended = true;
      this.emit('ended');
    },
    flushHeaders() {
      this.headersSent = true;
    },
  });

  return response as FakeResponse;
}

void test('createLlmChatHandler aborts the upstream stream when the request is aborted', async () => {
  const { createLlmChatHandler } = await import('./http/llmRoutes.js');

  let observedSignal: AbortSignal | undefined;
  const handler = createLlmChatHandler(
    {
      llmProviderStore: {
        getProviderWithApiKey() {
          return {
            id: 'provider-1',
            enabled: true,
          };
        },
      } as never,
    },
    {
      streamChatFn: async function* (provider, model, messages, signal) {
        void provider;
        void model;
        void messages;
        observedSignal = signal;
        await new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        yield { type: 'done' as const };
      },
    }
  );

  const request = createFakeRequest();
  const response = createFakeResponse();
  const handling = handler(request as never, response as never, (() => {}) as never);

  request.emit('aborted');
  await handling;

  assert.equal(observedSignal?.aborted, true);
  assert.equal(response.ended, true);
});

void test('createLlmChatHandler aborts the upstream stream when the response closes early', async () => {
  const { createLlmChatHandler } = await import('./http/llmRoutes.js');

  let observedSignal: AbortSignal | undefined;
  const handler = createLlmChatHandler(
    {
      llmProviderStore: {
        getProviderWithApiKey() {
          return {
            id: 'provider-1',
            enabled: true,
          };
        },
      } as never,
    },
    {
      streamChatFn: async function* (provider, model, messages, signal) {
        void provider;
        void model;
        void messages;
        observedSignal = signal;
        await new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        yield { type: 'done' as const };
      },
    }
  );

  const request = createFakeRequest();
  const response = createFakeResponse();
  const handling = handler(request as never, response as never, (() => {}) as never);

  response.emit('close');
  await handling;

  assert.equal(observedSignal?.aborted, true);
  assert.equal(response.ended, true);
});
