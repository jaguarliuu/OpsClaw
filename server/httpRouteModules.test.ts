import assert from 'node:assert/strict';
import test from 'node:test';

type RegisteredRoute = {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
};

type FakeApp = {
  get: (path: string, ...handlers: unknown[]) => void;
  post: (path: string, ...handlers: unknown[]) => void;
  put: (path: string, ...handlers: unknown[]) => void;
  delete: (path: string, ...handlers: unknown[]) => void;
};

function createFakeApp(routes: RegisteredRoute[]): FakeApp {
  return {
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
}

void test('route modules register their own route domains', async () => {
  const [
    { registerNodeRoutes },
    { registerNodeDashboardRoutes },
    { registerGroupRoutes },
    { registerCommandRoutes },
    { registerLlmRoutes },
    { registerAgentRoutes },
    { registerMemoryRoutes },
    { registerScriptRoutes },
    { registerSftpRoutes },
  ] = await Promise.all([
    import('./http/nodeRoutes.js'),
    import('./http/nodeDashboardRoutes.js'),
    import('./http/groupRoutes.js'),
    import('./http/commandRoutes.js'),
    import('./http/llmRoutes.js'),
    import('./http/agentRoutes.js'),
    import('./http/memoryRoutes.js'),
    import('./http/scriptRoutes.js'),
    import('./http/sftpRoutes.js'),
  ]);

  const routes: RegisteredRoute[] = [];
  const app = createFakeApp(routes);
  const deps = {
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
    appLockStore: {} as never,
  };

  registerNodeRoutes(app as never, deps);
  registerNodeDashboardRoutes(app as never, deps);
  registerGroupRoutes(app as never, deps);
  registerCommandRoutes(app as never, deps);
  registerLlmRoutes(app as never, deps);
  registerAgentRoutes(app as never, deps);
  registerMemoryRoutes(app as never, deps);
  registerScriptRoutes(app as never, deps);
  registerSftpRoutes(app as never, deps);

  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/nodes'));
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/nodes/:id/dashboard'));
  assert.ok(
    routes.some((route) => route.method === 'post' && route.path === '/api/nodes/:id/dashboard/collect')
  );
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/groups'));
  assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/commands'));
  assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/llm/chat'));
  assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/agent/runs'));
  assert.equal(routes.some((route) => route.path.includes('/gates/')), false);
  assert.ok(
    routes.some(
      (route) =>
        route.method === 'post' &&
        route.path === '/api/agent/runs/:runId/interactions/:requestId/submit'
    )
  );
  assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/agent/runs/:runId/stream'));
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/memory/global'));
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/scripts'));
  assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/scripts'));
  assert.ok(routes.some((route) => route.method === 'put' && route.path === '/api/scripts/:id'));
  assert.ok(routes.some((route) => route.method === 'delete' && route.path === '/api/scripts/:id'));
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/nodes/:id/sftp/list'));
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/nodes/:id/sftp/file'));
  assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/nodes/:id/sftp/file-content'));
  assert.ok(routes.some((route) => route.method === 'post' && route.path === '/api/nodes/:id/sftp/file-local'));
  assert.ok(
    routes.some((route) => route.method === 'post' && route.path === '/api/nodes/:id/sftp/directories')
  );
  assert.ok(routes.some((route) => route.method === 'get' && route.path === '/api/nodes/:id/sftp/tasks'));
});
