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

void test('resume-waiting returns 200 and resumes a suspended terminal_input gate', async () => {
  const routes: RegisteredRoute[] = [];
  const app = createFakeApp(routes);
  const snapshot = {
    runId: 'run-1',
    sessionId: 'session-1',
    task: '设置 root 密码',
    state: 'waiting_for_human',
    openGate: {
      id: 'gate-1',
      runId: 'run-1',
      sessionId: 'session-1',
      kind: 'terminal_input',
      status: 'open',
      reason: '命令正在等待你在终端中继续输入。',
      openedAt: 1,
      deadlineAt: 2,
      payload: {
        toolCallId: 'call-1',
        toolName: 'session.run_command',
        command: 'sudo passwd root',
        timeoutMs: 300_000,
      },
    },
  };
  const calls: Array<{ runId: string; gateId: string }> = [];

  registerAgentRoutes(app as never, {
    llmProviderStore: {} as never,
    agentRuntime: {
      resumeWaiting(runId: string, gateId: string) {
        calls.push({ runId, gateId });
        return snapshot;
      },
    } as never,
  });

  const handler = getRequiredRoute(routes, '/api/agent/runs/:runId/gates/:gateId/resume-waiting');
  const response = createFakeResponse();

  await handler(createFakeRequest({ runId: 'run-1', gateId: 'gate-1' }), response);

  assert.deepEqual(calls, [{ runId: 'run-1', gateId: 'gate-1' }]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, snapshot);
});

void test('resolve and reject return 200 with the updated gate snapshot', async () => {
  const routes: RegisteredRoute[] = [];
  const app = createFakeApp(routes);
  const calls: Array<{
    action: string;
    runId: string;
    gateId: string;
    input?: { fields?: Record<string, string> };
  }> = [];

  registerAgentRoutes(app as never, {
    llmProviderStore: {} as never,
    agentRuntime: {
      resolveGate(runId: string, gateId: string, input?: { fields?: Record<string, string> }) {
        calls.push({ action: 'resolve', runId, gateId, input });
        return {
          runId,
          sessionId: 'session-1',
          task: '重启 nginx 服务',
          state: 'suspended',
          openGate: {
            id: gateId,
            runId,
            sessionId: 'session-1',
            kind: 'approval',
            status: 'resolved',
            reason: '需要审批',
            openedAt: 1,
            deadlineAt: 2,
            payload: {
              toolCallId: 'call-1',
              toolName: 'session.run_command',
              arguments: { command: 'systemctl restart nginx' },
              policy: { action: 'require_approval', matches: [] },
            },
          },
        };
      },
      rejectGate(runId: string, gateId: string) {
        calls.push({ action: 'reject', runId, gateId });
        return {
          runId,
          sessionId: 'session-1',
          task: '重启 nginx 服务',
          state: 'suspended',
          openGate: {
            id: gateId,
            runId,
            sessionId: 'session-1',
            kind: 'approval',
            status: 'rejected',
            reason: '需要审批',
            openedAt: 1,
            deadlineAt: 2,
            payload: {
              toolCallId: 'call-1',
              toolName: 'session.run_command',
              arguments: { command: 'systemctl restart nginx' },
              policy: { action: 'require_approval', matches: [] },
            },
          },
        };
      },
    } as never,
  });

  const resolveHandler = getRequiredRoute(routes, '/api/agent/runs/:runId/gates/:gateId/resolve');
  const rejectHandler = getRequiredRoute(routes, '/api/agent/runs/:runId/gates/:gateId/reject');

  const resolveResponse = createFakeResponse();
  await resolveHandler(
    createFakeRequest(
      { runId: 'run-1', gateId: 'gate-1' },
      {
        fields: {
          username: 'ops-admin',
          password: 'masked-secret',
        },
      }
    ),
    resolveResponse
  );
  assert.equal((resolveResponse.body as { openGate?: { status?: string } }).openGate?.status, 'resolved');

  const rejectResponse = createFakeResponse();
  await rejectHandler(createFakeRequest({ runId: 'run-1', gateId: 'gate-2' }), rejectResponse);
  assert.equal((rejectResponse.body as { openGate?: { status?: string } }).openGate?.status, 'rejected');

  assert.deepEqual(calls, [
    {
      action: 'resolve',
      runId: 'run-1',
      gateId: 'gate-1',
      input: {
        fields: {
          username: 'ops-admin',
          password: 'masked-secret',
        },
      },
    },
    { action: 'reject', runId: 'run-1', gateId: 'gate-2' },
  ]);
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
