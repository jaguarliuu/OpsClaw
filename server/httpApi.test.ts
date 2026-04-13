import assert from 'node:assert/strict';
import test from 'node:test';

type RegisteredRoute = {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
};

type FakeApp = {
  use: (...args: unknown[]) => void;
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  put: (path: string, ...handlers: unknown[]) => void;
  delete: (path: string, ...handlers: unknown[]) => void;
};

void test('registerOpsClawHttpApi registers the core HTTP surface on the app', async () => {
  const { registerOpsClawHttpApi } = await import('./httpApi.js');

  const routes: RegisteredRoute[] = [];
  const app: FakeApp = {
    use() {},
    get(path) {
      routes.push({ method: 'get', path });
    },
    post(path) {
      routes.push({ method: 'post', path });
    },
    put(path) {
      routes.push({ method: 'put', path });
    },
    delete(path) {
      routes.push({ method: 'delete', path });
    },
  };

  registerOpsClawHttpApi(app as never, {
    nodeStore: {} as never,
    commandHistoryStore: {} as never,
    llmProviderStore: {} as never,
    scriptLibraryStore: {} as never,
    nodeInspectionStore: {} as never,
    nodeInspectionService: {} as never,
    sftpStore: {} as never,
    sftpService: {} as never,
    fileMemoryStore: {} as never,
    agentRuntime: {} as never,
  });

  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/health'));
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/nodes'));
  assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/llm/providers'));
  assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/agent/runs'));
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/scripts'));
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/nodes/:id/sftp/list'));
  assert.ok(
    routes.some((route) => route.method === 'post' && route.path === '/api/nodes/:id/sftp/directories')
  );
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/nodes/:id/sftp/tasks'));
  assert.ok(routes.some((route) => route.method === 'put' && route.path === '/api/memory/nodes/:id'));
  assert.ok(routes.some((route) => route.method === 'delete' && route.path === '/api/nodes/:id'));
});
