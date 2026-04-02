import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

type NodeStoreModule = typeof import('./nodeStore.js');
type LlmProviderStoreModule = typeof import('./llmProviderStore.js');
type LlmClientModule = typeof import('./llmClient.js');

const originalCwd = process.cwd();

let tempRoot = '';
let nodeStoreModule: NodeStoreModule;
let llmProviderStoreModule: LlmProviderStoreModule;
let llmClientModule: LlmClientModule;

function settlePersistence() {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opsclaw-p0-'));
  process.chdir(tempRoot);
  process.env.OPSCLAW_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  nodeStoreModule = await import('./nodeStore.js');
  llmProviderStoreModule = await import('./llmProviderStore.js');
  llmClientModule = await import('./llmClient.js');
});

test.after(async () => {
  await settlePersistence();
  process.chdir(originalCwd);
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('公开节点详情不应暴露明文凭证，但内部连接接口仍可读取秘密', async () => {
  const nodeStore = await nodeStoreModule.createNodeStore();
  const createdNode = await nodeStore.createNode({
    name: 'prod-api-1',
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    authMode: 'password',
    password: 'super-secret',
    groupName: '默认',
  });

  const publicNode = nodeStore.getNode(createdNode!.id) as Record<string, unknown> | null;
  assert.ok(publicNode, 'expected public node detail');
  assert.equal(publicNode.password, null);
  assert.equal(publicNode.privateKey, null);
  assert.equal(publicNode.passphrase, null);
  assert.equal(publicNode.hasPassword, true);

  const getNodeWithSecrets = (
    nodeStore as unknown as {
      getNodeWithSecrets?: (id: string) => Record<string, unknown> | null;
    }
  ).getNodeWithSecrets;
  assert.equal(typeof getNodeWithSecrets, 'function');
  const internalNode = getNodeWithSecrets?.(createdNode!.id);
  assert.ok(internalNode, 'expected internal node detail');
  assert.equal(internalNode.password, 'super-secret');
});

test('公开 LLM provider 配置不应返回 API Key，但执行接口仍可读取密钥', async () => {
  const store = await llmProviderStoreModule.createLlmProviderStore();
  const created = store.createProvider({
    name: 'Qwen Prod',
    providerType: 'qwen',
    apiKey: 'llm-secret',
    models: ['qwen-plus'],
  });
  await settlePersistence();

  const listed = store.listProviders();
  assert.equal(listed.length, 1);
  assert.equal((listed[0] as Record<string, unknown>).apiKey, '');
  assert.equal((listed[0] as Record<string, unknown>).hasApiKey, true);

  const publicProvider = store.getProvider(created.id) as Record<string, unknown> | null;
  assert.ok(publicProvider, 'expected public provider detail');
  assert.equal(publicProvider.apiKey, '');
  assert.equal(publicProvider.hasApiKey, true);

  const getProviderWithApiKey = (
    store as unknown as {
      getProviderWithApiKey?: (id: string) => Record<string, unknown> | null;
    }
  ).getProviderWithApiKey;
  assert.equal(typeof getProviderWithApiKey, 'function');
  const internalProvider = getProviderWithApiKey?.(created.id);
  assert.ok(internalProvider, 'expected internal provider detail');
  assert.equal(internalProvider.apiKey, 'llm-secret');
});

test('设置不存在的默认 provider 不应清空当前默认值', async () => {
  const store = await llmProviderStoreModule.createLlmProviderStore();
  const first = store.createProvider({
    name: 'First',
    providerType: 'qwen',
    apiKey: 'first-secret',
    models: ['qwen-plus'],
  });
  await settlePersistence();
  const second = store.createProvider({
    name: 'Second',
    providerType: 'deepseek',
    apiKey: 'second-secret',
    models: ['deepseek-chat'],
  });
  await settlePersistence();

  store.setDefaultProvider(first.id);
  await settlePersistence();
  assert.equal(store.getDefaultProvider()?.id, first.id);

  assert.throws(() => store.setDefaultProvider('missing-provider'));
  assert.equal(store.getDefaultProvider()?.id, first.id);

  store.setDefaultProvider(second.id);
  await settlePersistence();
  assert.equal(store.getDefaultProvider()?.id, second.id);
});

test('chat 上下文构造必须保留 assistant 历史消息', () => {
  const buildChatMessages = (
    llmClientModule as unknown as {
      buildChatMessages?: (
        messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
      ) => Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  ).buildChatMessages;
  assert.equal(typeof buildChatMessages, 'function');

  const messages = buildChatMessages?.([
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: '第一问' },
    { role: 'assistant', content: '第一答' },
    { role: 'user', content: '第二问' },
  ]);

  assert.equal(messages?.length, 3);
  assert.equal(messages?.[0]?.role, 'user');
  assert.equal(messages?.[1]?.role, 'assistant');
  assert.equal(messages?.[2]?.role, 'user');
  assert.equal(
    ((messages?.[1] as unknown as { content?: Array<{ text?: string }> })?.content?.[0]?.text),
    '第一答'
  );
});
