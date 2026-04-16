import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const originalCwd = process.cwd();
const originalDesktopFlag = process.env.OPSCLAW_DESKTOP;

let tempRoot = '';

type CapturedResponse = {
  status: (code: number) => CapturedResponse;
  json: (payload: unknown) => void;
};

type CapturedRequest = {
  body: unknown;
};

type CapturedPostHandler = (request: CapturedRequest, response: CapturedResponse) => Promise<void> | void;

function listen(server: http.Server) {
  return new Promise<number>((resolve, reject) => {
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('server did not bind to a TCP port'));
        return;
      }

      resolve(address.port);
    });
    server.on('error', reject);
  });
}

function close(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opsclaw-app-'));
  process.chdir(tempRoot);
  process.env.OPSCLAW_MASTER_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

test.after(async () => {
  process.chdir(originalCwd);
  if (originalDesktopFlag === undefined) {
    delete process.env.OPSCLAW_DESKTOP;
  } else {
    process.env.OPSCLAW_DESKTOP = originalDesktopFlag;
  }
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

void test('createOpsClawServerApp wires core API endpoints without starting the process listener', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');

  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);

  try {
    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { ok: true });

    const createProviderResponse = await fetch(`http://127.0.0.1:${port}/api/llm/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Qwen Prod',
        providerType: 'qwen',
        apiKey: 'secret-key',
        models: ['qwen-plus'],
        defaultModel: 'qwen-plus',
      }),
    });
    assert.equal(createProviderResponse.status, 201);
    const createdProviderPayload = (await createProviderResponse.json()) as {
      item: { id: string; defaultModel?: string | null };
    };
    assert.equal(createdProviderPayload.item.defaultModel, 'qwen-plus');

    const createCustomProviderResponse = await fetch(`http://127.0.0.1:${port}/api/llm/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Custom OpenAI',
        providerType: 'openai_compatible',
        baseUrl: 'https://llm.example.com/v1',
        apiKey: 'custom-secret',
        models: ['gpt-4.1', 'gpt-4.1-mini'],
        defaultModel: 'gpt-4.1-mini',
      }),
    });
    assert.equal(createCustomProviderResponse.status, 201);
    const customProviderPayload = (await createCustomProviderResponse.json()) as {
      item: {
        id: string;
        providerType: string;
        baseUrl: string | null;
        models: string[];
        defaultModel?: string | null;
      };
    };
    assert.equal(customProviderPayload.item.providerType, 'openai_compatible');
    assert.equal(customProviderPayload.item.baseUrl, 'https://llm.example.com/v1');
    assert.deepEqual(customProviderPayload.item.models, ['gpt-4.1', 'gpt-4.1-mini']);
    assert.equal(customProviderPayload.item.defaultModel, 'gpt-4.1-mini');

    const updateProviderResponse = await fetch(
      `http://127.0.0.1:${port}/api/llm/providers/${customProviderPayload.item.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          models: ['gpt-4.1-nano', 'gpt-4.1'],
          defaultModel: 'gpt-4.1-nano',
        }),
      }
    );
    assert.equal(updateProviderResponse.status, 200);
    const updatedProviderPayload = (await updateProviderResponse.json()) as {
      item: { models: string[]; defaultModel?: string | null };
    };
    assert.deepEqual(updatedProviderPayload.item.models, ['gpt-4.1-nano', 'gpt-4.1']);
    assert.equal(updatedProviderPayload.item.defaultModel, 'gpt-4.1-nano');

    const providersResponse = await fetch(`http://127.0.0.1:${port}/api/llm/providers`);
    assert.equal(providersResponse.status, 200);
    const providersPayload = (await providersResponse.json()) as {
      items: Array<{
        name: string;
        providerType: string;
        hasApiKey: boolean;
        apiKey: string;
        baseUrl: string | null;
        defaultModel?: string | null;
      }>;
    };
    assert.equal(providersPayload.items.length, 2);
    const qwenProvider = providersPayload.items.find((item) => item.name === 'Qwen Prod');
    const customProvider = providersPayload.items.find((item) => item.name === 'Custom OpenAI');
    assert.equal(qwenProvider?.hasApiKey, true);
    assert.equal(qwenProvider?.apiKey, '');
    assert.equal(qwenProvider?.defaultModel, 'qwen-plus');
    assert.equal(customProvider?.providerType, 'openai_compatible');
    assert.equal(customProvider?.baseUrl, 'https://llm.example.com/v1');
    assert.equal(customProvider?.defaultModel, 'gpt-4.1-nano');

    const nodesResponse = await fetch(`http://127.0.0.1:${port}/api/nodes`);
    assert.equal(nodesResponse.status, 200);
    assert.deepEqual(await nodesResponse.json(), { items: [] });

    const createScriptResponse = await fetch(`http://127.0.0.1:${port}/api/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'disk-usage',
        alias: 'disk-usage',
        scope: 'global',
        nodeId: null,
        title: '磁盘占用',
        description: '查看磁盘占用',
        kind: 'plain',
        content: 'df -h',
        variables: [],
        tags: ['inspect'],
      }),
    });
    assert.equal(createScriptResponse.status, 201);

    const scriptsResponse = await fetch(`http://127.0.0.1:${port}/api/scripts`);
    assert.equal(scriptsResponse.status, 200);
    const scriptsPayload = (await scriptsResponse.json()) as {
      items: Array<{ key: string; title: string; resolvedFrom: string }>;
    };
    assert.equal(scriptsPayload.items.length, 1);
    assert.equal(scriptsPayload.items[0]?.key, 'disk-usage');
    assert.equal(scriptsPayload.items[0]?.resolvedFrom, 'global');
  } finally {
    await close(runtime.server);
  }
});

void test('script routes round-trip alias for create and list', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);

  try {
    const createResponse = await fetch(`http://127.0.0.1:${port}/api/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'disk-usage-alias-roundtrip',
        alias: 'disk-roundtrip',
        scope: 'global',
        nodeId: null,
        title: '查看磁盘',
        description: '',
        kind: 'plain',
        content: 'df -h',
        variables: [],
        tags: [],
      }),
    });

    assert.equal(createResponse.status, 201);
    const createdPayload = (await createResponse.json()) as { item: { alias: string } };
    assert.equal(createdPayload.item.alias, 'disk-roundtrip');

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/scripts`);
    const listPayload = (await listResponse.json()) as { items: Array<{ alias: string }> };
    assert.equal(listPayload.items.some((item) => item.alias === 'disk-roundtrip'), true);
  } finally {
    await close(runtime.server);
  }
});

void test('sftp routes are registered on server app and do not fall through to 404', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);

  try {
    const listResponse = await fetch(`http://127.0.0.1:${port}/api/nodes/node-1/sftp/list`);
    assert.equal(listResponse.status, 404);
    assert.deepEqual(await listResponse.json(), { message: '节点不存在。' });

    const tasksResponse = await fetch(`http://127.0.0.1:${port}/api/nodes/node-1/sftp/tasks`);
    assert.notEqual(tasksResponse.status, 404);
    assert.equal(tasksResponse.status, 200);
    assert.deepEqual(await tasksResponse.json(), { items: [] });
  } finally {
    await close(runtime.server);
  }
});

void test('sftp list route falls back to current directory when query path is missing', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);
  const capturedPaths: string[] = [];

  runtime.sftpService.listDirectory = async ({ nodeId, path }) => {
    capturedPaths.push(`${nodeId}:${path}`);
    return { path, items: [] };
  };

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/nodes/node-1/sftp/list`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { path: '.', items: [] });
    assert.deepEqual(capturedPaths, ['node-1:.']);
  } finally {
    await close(runtime.server);
  }
});

void test('sftp download route returns binary payload without falling through', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);
  let capturedInput: { nodeId: string; path: string } | null = null;

  (runtime.sftpService as Record<string, unknown>).downloadFile = async (input: {
    nodeId: string;
    path: string;
  }) => {
    capturedInput = input;
    return {
      path: input.path,
      name: 'readme.txt',
      buffer: Buffer.from('hello-web-sftp', 'utf8'),
    };
  };

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/nodes/node-1/sftp/file?path=${encodeURIComponent('/srv/readme.txt')}`
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/octet-stream');
    assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename="readme.txt"/);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString('utf8'), 'hello-web-sftp');
    assert.deepEqual(capturedInput, {
      nodeId: 'node-1',
      path: '/srv/readme.txt',
    });
  } finally {
    await close(runtime.server);
  }
});

void test('sftp browser upload route accepts raw file bytes', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);
  let capturedInput:
    | { nodeId: string; path: string; content: Buffer; fileName?: string | null }
    | null = null;

  (runtime.sftpService as Record<string, unknown>).uploadBuffer = async (input: {
    nodeId: string;
    path: string;
    content: Buffer;
    fileName?: string | null;
  }) => {
    capturedInput = input;
    return {
      path: input.path,
      size: input.content.length,
    };
  };

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/nodes/node-1/sftp/file-content?path=${encodeURIComponent('/srv/upload.txt')}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-OpsClaw-File-Name': 'upload.txt',
        },
        body: Buffer.from('abc123', 'utf8'),
      }
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      path: '/srv/upload.txt',
      size: 6,
    });
    assert.deepEqual(capturedInput, {
      nodeId: 'node-1',
      path: '/srv/upload.txt',
      content: Buffer.from('abc123', 'utf8'),
      fileName: 'upload.txt',
    });
  } finally {
    await close(runtime.server);
  }
});

void test('script management route returns raw node scripts for settings page', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);

  try {
    await fetch(`http://127.0.0.1:${port}/api/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'restart-global-manage',
        alias: 'restart-manage',
        scope: 'global',
        nodeId: null,
        title: '全局脚本',
        description: '',
        kind: 'plain',
        content: 'echo global',
        variables: [],
        tags: [],
      }),
    });

    await fetch(`http://127.0.0.1:${port}/api/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'restart-node-manage',
        alias: 'restart-manage',
        scope: 'node',
        nodeId: 'node-1',
        title: '节点脚本',
        description: '',
        kind: 'plain',
        content: 'echo node',
        variables: [],
        tags: [],
      }),
    });

    const response = await fetch(
      `http://127.0.0.1:${port}/api/scripts/manage?scope=node&nodeId=node-1`
    );
    const payload = (await response.json()) as {
      items: Array<{
        alias: string;
        nodeId: string | null;
        resolvedFrom?: string;
        overridesGlobal?: boolean;
        scope: string;
      }>;
    };

    assert.equal(response.status, 200);
    assert.deepEqual(payload.items.map((item) => item.alias), ['restart-manage']);
    assert.equal(payload.items[0]?.scope, 'node');
    assert.equal(payload.items[0]?.nodeId, 'node-1');
    assert.equal('resolvedFrom' in (payload.items[0] ?? {}), false);
    assert.equal('overridesGlobal' in (payload.items[0] ?? {}), false);
  } finally {
    await close(runtime.server);
  }
});

void test('script management route rejects invalid query combinations', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);

  try {
    const invalidScopeResponse = await fetch(
      `http://127.0.0.1:${port}/api/scripts/manage?scope=invalid`
    );
    const invalidScopePayload = (await invalidScopeResponse.json()) as { message: string };
    assert.equal(invalidScopeResponse.status, 400);
    assert.match(invalidScopePayload.message, /scope 参数不合法/);

    const missingNodeIdResponse = await fetch(
      `http://127.0.0.1:${port}/api/scripts/manage?scope=node`
    );
    const missingNodeIdPayload = (await missingNodeIdResponse.json()) as { message: string };
    assert.equal(missingNodeIdResponse.status, 400);
    assert.match(missingNodeIdPayload.message, /必须提供 nodeId/);
  } finally {
    await close(runtime.server);
  }
});

void test('createOpsClawServerApp allows desktop renderer requests from file-origin pages', async () => {
  process.env.OPSCLAW_DESKTOP = '1';

  const { createOpsClawServerApp } = await import('./serverApp.js');

  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);

  try {
    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: {
        Origin: 'null',
      },
    });

    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.headers.get('access-control-allow-origin'), 'null');
  } finally {
    await close(runtime.server);
  }
});

void test('node import bootstraps inspection profile for each successful row', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');
  const runtime = await createOpsClawServerApp();
  const port = await listen(runtime.server);

  try {
    const importResponse = await fetch(`http://127.0.0.1:${port}/api/nodes/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv: [
          'name,host,port,username,authMode,password',
          'csv-node,10.0.0.9,22,ubuntu,password,secret',
        ].join('\n'),
      }),
    });
    assert.equal(importResponse.status, 200);
    const importPayload = (await importResponse.json()) as {
      results: Array<{ success: boolean; row: number; name?: string; error?: string }>;
    };

    assert.deepEqual(importPayload.results, [{ success: true, row: 2, name: 'csv-node' }]);
    const node = runtime.nodeStore.listNodes().find((item) => item.name === 'csv-node');
    assert.ok(node);
    const profile = runtime.nodeInspectionStore.getProfile(node.id);
    assert.equal(profile?.dashboardSchemaKey, 'default_system');
  } finally {
    await close(runtime.server);
  }
});

void test('node import rolls back created node when inspection bootstrap fails', async () => {
  const { registerNodeRoutes } = await import('./http/nodeRoutes.js');

  let importHandler: CapturedPostHandler | null = null;

  registerNodeRoutes(
    {
      get() {},
      post(path: string, handler: CapturedPostHandler) {
        if (path === '/api/nodes/import') {
          importHandler = handler;
        }
      },
      put() {},
      delete() {},
    } as never,
    {
      nodeStore: {
        async createNode() {
          return {
            id: 'node-import-fail',
            name: 'broken-node',
          };
        },
        async deleteNode(id: string) {
          deletedNodeIds.push(id);
          return true;
        },
      },
      nodeInspectionService: {
        async ensureNodeBootstrap() {
          throw new Error('bootstrap failed');
        },
        async deleteNodeInspectionData(id: string) {
          deletedInspectionIds.push(id);
        },
      },
    } as never
  );

  const deletedNodeIds: string[] = [];
  const deletedInspectionIds: string[] = [];
  let statusCode = 200;
  let jsonPayload: unknown = null;

  if (!importHandler) {
    throw new Error('import handler not registered');
  }
  const runImportHandler: CapturedPostHandler = importHandler;
  await runImportHandler(
    {
      body: {
        csv: [
          'name,host,port,username,authMode,password',
          'broken-node,10.0.0.10,22,ubuntu,password,secret',
        ].join('\n'),
      },
    },
    {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        jsonPayload = payload;
      },
    }
  );

  assert.equal(statusCode, 200);
  assert.deepEqual(jsonPayload, {
    results: [{ success: false, row: 2, error: 'bootstrap failed' }],
  });
  assert.deepEqual(deletedNodeIds, ['node-import-fail']);
  assert.deepEqual(deletedInspectionIds, ['node-import-fail']);
});

void test('single node creation rolls back created node when inspection bootstrap fails', async () => {
  const { registerNodeRoutes } = await import('./http/nodeRoutes.js');

  let createHandler: CapturedPostHandler | null = null;

  const deletedNodeIds: string[] = [];
  const deletedInspectionIds: string[] = [];
  let statusCode = 200;
  let jsonPayload: unknown = null;

  registerNodeRoutes(
    {
      get() {},
      post(path: string, handler: CapturedPostHandler) {
        if (path === '/api/nodes') {
          createHandler = handler;
        }
      },
      put() {},
      delete() {},
    } as never,
    {
      nodeStore: {
        async createNode() {
          return {
            id: 'node-create-fail',
            name: 'broken-single-node',
          };
        },
        async deleteNode(id: string) {
          deletedNodeIds.push(id);
          return true;
        },
      },
      nodeInspectionService: {
        async ensureNodeBootstrap() {
          throw new Error('bootstrap failed');
        },
        async deleteNodeInspectionData(id: string) {
          deletedInspectionIds.push(id);
        },
      },
    } as never
  );

  if (!createHandler) {
    throw new Error('create handler not registered');
  }
  const runCreateHandler: CapturedPostHandler = createHandler;
  await runCreateHandler(
    {
      body: {
        name: 'broken-single-node',
        host: '10.0.0.10',
        port: 22,
        username: 'ubuntu',
        authMode: 'password',
        password: 'secret',
      },
    },
    {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        jsonPayload = payload;
      },
    }
  );

  assert.equal(statusCode, 500);
  assert.deepEqual(jsonPayload, { message: '节点保存失败。' });
  assert.deepEqual(deletedNodeIds, ['node-create-fail']);
  assert.deepEqual(deletedInspectionIds, ['node-create-fail']);
});

void test('dashboard endpoints are wired and node lifecycle bootstraps inspection data', async () => {
  const { createOpsClawServerApp } = await import('./serverApp.js');

  const runtime = await createOpsClawServerApp({
    runNodeInspectionCommand: async () =>
      JSON.stringify({
        schemaVersion: 1,
        collectedAt: '2026-04-09T11:00:00.000Z',
        cpu: { usagePercent: 58 },
      }),
  });
  const port = await listen(runtime.server);

  try {
    const createNodeResponse = await fetch(`http://127.0.0.1:${port}/api/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'dashboard-node',
        host: '10.0.0.8',
        port: 22,
        username: 'ubuntu',
        authMode: 'password',
        password: 'secret',
      }),
    });
    assert.equal(createNodeResponse.status, 201);
    const createdNodePayload = (await createNodeResponse.json()) as { item: { id: string } };
    const nodeId = createdNodePayload.item.id;

    const profile = runtime.nodeInspectionStore.getProfile(nodeId);
    assert.equal(profile?.dashboardSchemaKey, 'default_system');
    const profileScript = profile ? runtime.scriptLibraryStore.getScript(profile.scriptId) : null;
    assert.equal(profileScript?.usage, 'inspection');

    const dashboardResponse = await fetch(`http://127.0.0.1:${port}/api/nodes/${nodeId}/dashboard`);
    assert.equal(dashboardResponse.status, 200);
    const dashboardPayload = (await dashboardResponse.json()) as {
      profile: { dashboardSchemaKey: string };
      latestSnapshot: null;
      latestSuccessSnapshot: null;
      recentSnapshots: unknown[];
    };
    assert.equal(dashboardPayload.profile.dashboardSchemaKey, 'default_system');
    assert.equal(dashboardPayload.latestSnapshot, null);
    assert.equal(dashboardPayload.latestSuccessSnapshot, null);
    assert.deepEqual(dashboardPayload.recentSnapshots, []);

    const collectResponse = await fetch(`http://127.0.0.1:${port}/api/nodes/${nodeId}/dashboard/collect`, {
      method: 'POST',
    });
    assert.equal(collectResponse.status, 200);
    const collectPayload = (await collectResponse.json()) as {
      latestSnapshot: { status: string; summaryJson: { cpuUsagePercent: number } | null };
      latestSuccessSnapshot: { status: string } | null;
    };
    assert.equal(collectPayload.latestSnapshot.status, 'success');
    assert.equal(collectPayload.latestSnapshot.summaryJson?.cpuUsagePercent, 58);
    assert.equal(collectPayload.latestSuccessSnapshot?.status, 'success');

    const deleteNodeResponse = await fetch(`http://127.0.0.1:${port}/api/nodes/${nodeId}`, {
      method: 'DELETE',
    });
    assert.equal(deleteNodeResponse.status, 204);
    assert.equal(runtime.nodeInspectionStore.getProfile(nodeId), null);
    assert.deepEqual(runtime.nodeInspectionStore.listSnapshots(nodeId), []);
    assert.equal(profile ? runtime.scriptLibraryStore.getScript(profile.scriptId) : null, null);
  } finally {
    await close(runtime.server);
  }
});
