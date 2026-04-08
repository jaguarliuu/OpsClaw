import assert from 'node:assert/strict';
import test from 'node:test';

import { registerAgentRoutes } from './agentRoutes.js';

type RegisteredRoute = {
  method: 'get' | 'post';
  path: string;
  handler: (request: FakeRequest, response: FakeResponse) => Promise<void> | void;
};

type FakeRequest = {
  params: Record<string, string>;
  body?: unknown;
  on: (event: 'aborted', handler: () => void) => void;
};

type FakeResponse = {
  statusCode: number;
  body: unknown;
  chunks: string[];
  ended: boolean;
  headersSent: boolean;
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
  flushHeaders: () => void;
  status: (code: number) => FakeResponse;
  json: (payload: unknown) => FakeResponse;
  write: (chunk: string) => void;
  end: () => void;
  on: (event: 'close', handler: () => void) => void;
};

function createFakeApp(routes: RegisteredRoute[]) {
  return {
    get(path: string, handler: RegisteredRoute['handler']) {
      routes.push({ method: 'get', path, handler });
    },
    post(path: string, handler: RegisteredRoute['handler']) {
      routes.push({ method: 'post', path, handler });
    },
  };
}

function createFakeRequest(params: Record<string, string>, body?: unknown): FakeRequest {
  return {
    params,
    body,
    on() {
      // no-op
    },
  };
}

function createFakeResponse(): FakeResponse {
  return {
    statusCode: 200,
    body: null,
    chunks: [],
    ended: false,
    headersSent: false,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    write(chunk) {
      this.chunks.push(chunk);
      this.headersSent = true;
    },
    end() {
      this.ended = true;
    },
    on() {
      // no-op
    },
  };
}

function getRequiredRoute(
  routes: RegisteredRoute[],
  path: string,
  method: RegisteredRoute['method'] = 'post'
): RegisteredRoute['handler'] {
  const route = routes.find((candidate) => candidate.method === method && candidate.path === path);
  assert.ok(route, `missing route ${path}`);
  return route.handler;
}

void test('submit interaction proxies selectedAction and payload', async () => {
  const routes: RegisteredRoute[] = [];
  const app = createFakeApp(routes);
  const snapshot = {
    runId: 'run-1',
    sessionId: 'session-1',
    task: '重启 nginx 服务',
    state: 'suspended',
    executionState: 'suspended',
    blockingMode: 'none',
    activeInteraction: {
      id: 'interaction-1',
      runId: 'run-1',
      sessionId: 'session-1',
      status: 'resolved',
      interactionKind: 'approval',
      riskLevel: 'high',
      blockingMode: 'hard_block',
      title: '操作审批',
      message: '该操作需要用户审批后执行。',
      schemaVersion: 'v1',
      fields: [],
      actions: [
        { id: 'approve', label: '继续执行', kind: 'approve', style: 'danger' },
        { id: 'reject', label: '取消', kind: 'reject', style: 'secondary' },
      ],
      openedAt: 1,
      deadlineAt: null,
      metadata: {},
    },
    openGate: null,
  };
  const calls: Array<{
    runId: string;
    requestId: string;
    input: { selectedAction: string; payload: Record<string, unknown> };
  }> = [];

  registerAgentRoutes(app as never, {
    llmProviderStore: {} as never,
    agentRuntime: {
      submitInteraction(
        runId: string,
        requestId: string,
        input: { selectedAction: string; payload: Record<string, unknown> }
      ) {
        calls.push({ runId, requestId, input });
        return snapshot;
      },
    } as never,
  });

  const handler = getRequiredRoute(
    routes,
    '/api/agent/runs/:runId/interactions/:requestId/submit'
  );
  const response = createFakeResponse();

  await handler(
    createFakeRequest(
      { runId: 'run-1', requestId: 'interaction-1' },
      {
        selectedAction: 'approve',
        payload: {
          username: 'ops-admin',
        },
      }
    ),
    response
  );

  assert.deepEqual(calls, [
    {
      runId: 'run-1',
      requestId: 'interaction-1',
      input: {
        selectedAction: 'approve',
        payload: {
          username: 'ops-admin',
        },
      },
    },
  ]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, snapshot);
});

void test('stream continuation proxies SSE events for a resumed run', async () => {
  const routes: RegisteredRoute[] = [];
  const app = createFakeApp(routes);
  const calls: string[] = [];

  registerAgentRoutes(app as never, {
    llmProviderStore: {} as never,
    agentRuntime: {
      async streamContinuation(
        runId: string,
        emit: (event: { type: string; runId: string; timestamp: number }) => void,
        signal: AbortSignal
      ) {
        calls.push(runId);
        assert.equal(signal.aborted, false);
        emit({
          type: 'run_state_changed',
          runId,
          timestamp: 1,
        });
        emit({
          type: 'run_completed',
          runId,
          timestamp: 2,
        });
      },
    } as never,
  });

  const handler = getRequiredRoute(routes, '/api/agent/runs/:runId/stream');
  const response = createFakeResponse();

  await handler(createFakeRequest({ runId: 'run-1' }), response);

  assert.deepEqual(calls, ['run-1']);
  assert.equal(response.headers['Content-Type'], 'text/event-stream');
  assert.equal(response.ended, true);
  assert.deepEqual(response.chunks, [
    'data: {"type":"run_state_changed","runId":"run-1","timestamp":1}\n\n',
    'data: {"type":"run_completed","runId":"run-1","timestamp":2}\n\n',
  ]);
});

void test('create run streams SSE events for a new agent run', async () => {
  const routes: RegisteredRoute[] = [];
  const app = createFakeApp(routes);
  const calls: Array<{ providerId: string; model: string; task: string; sessionId: string }> = [];

  registerAgentRoutes(app as never, {
    llmProviderStore: {
      getProviderWithApiKey(providerId: string) {
        return {
          id: providerId,
          enabled: true,
        };
      },
    } as never,
    agentRuntime: {
      async run(
        input: {
          providerId: string;
          model: string;
          task: string;
          sessionId: string;
        },
        emit: (event: { type: string; runId: string; timestamp: number }) => void,
        signal: AbortSignal
      ) {
        calls.push(input);
        assert.equal(signal.aborted, false);
        emit({
          type: 'run_started',
          runId: 'run-1',
          timestamp: 1,
        });
        emit({
          type: 'run_completed',
          runId: 'run-1',
          timestamp: 2,
        });
      },
    } as never,
  });

  const handler = getRequiredRoute(routes, '/api/agent/runs');
  const response = createFakeResponse();

  await handler(
    createFakeRequest({}, {
      providerId: 'provider-1',
      model: 'qwen-plus',
      task: '检查磁盘',
      sessionId: 'session-1',
    }),
    response
  );

  assert.deepEqual(calls, [
    {
      providerId: 'provider-1',
      provider: {
        id: 'provider-1',
        enabled: true,
      },
      model: 'qwen-plus',
      task: '检查磁盘',
      sessionId: 'session-1',
      approvalMode: 'auto-readonly',
      maxSteps: undefined,
      maxCommandOutputChars: undefined,
    },
  ]);
  assert.equal(response.headers['Content-Type'], 'text/event-stream');
  assert.equal(response.ended, true);
  assert.deepEqual(response.chunks, [
    'data: {"type":"run_started","runId":"run-1","timestamp":1}\n\n',
    'data: {"type":"run_completed","runId":"run-1","timestamp":2}\n\n',
  ]);
});

void test('reattach route returns the latest reattachable run snapshot for a session', async () => {
  const routes: RegisteredRoute[] = [];
  const app = createFakeApp(routes);

  registerAgentRoutes(app as never, {
    llmProviderStore: {} as never,
    agentRuntime: {
      getSessionReattachableRun(sessionId: string) {
        assert.equal(sessionId, 'session-1');
        return {
          runId: 'run-2',
          sessionId,
          task: '重启 nginx',
          state: 'waiting_for_human',
          openGate: {
            id: 'gate-2',
            runId: 'run-2',
            sessionId,
            kind: 'approval',
            status: 'open',
            reason: '需要审批',
            openedAt: 1,
            deadlineAt: 2,
            payload: {
              toolCallId: 'call-2',
              toolName: 'session.run_command',
              arguments: { command: 'systemctl restart nginx' },
              policy: { action: 'require_approval', matches: [] },
            },
          },
        };
      },
    } as never,
  });

  const handler = getRequiredRoute(routes, '/api/agent/sessions/:sessionId/runs/reattach', 'get');
  const response = createFakeResponse();

  await handler(createFakeRequest({ sessionId: 'session-1' }), response);

  assert.equal((response.body as { item?: { runId?: string } }).item?.runId, 'run-2');
});
