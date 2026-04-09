import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const originalCwd = process.cwd();
const originalDesktopFlag = process.env.OPSCLAW_DESKTOP;

let tempRoot = '';

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
