import assert from 'node:assert/strict';
import test from 'node:test';

import type { LlmProvider } from './types.js';
import {
  deleteLlmSettingsProviderAndReload,
  loadLlmSettingsProviders,
  saveLlmSettingsProviderAndReload,
  setDefaultLlmSettingsProviderAndReload,
} from './llmSettingsControllerModel.js';

const provider: LlmProvider = {
  id: 'provider-1',
  name: 'Qwen Prod',
  providerType: 'qwen',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
  hasApiKey: true,
  models: ['qwen-plus'],
  defaultModel: 'qwen-plus',
  enabled: true,
  isDefault: false,
  maxTokens: 4096,
  temperature: 0.7,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

void test('loadLlmSettingsProviders delegates to the fetch function', async () => {
  const result = await loadLlmSettingsProviders({
    fetchProviders: async () => [provider],
  });

  assert.deepEqual(result, [provider]);
});

void test('saveLlmSettingsProviderAndReload creates the provider, sets default for the first entry, and reloads providers', async () => {
  const calls: string[] = [];

  const result = await saveLlmSettingsProviderAndReload(
    {
      mode: 'create',
      request: {
        name: 'Qwen Prod',
        providerType: 'qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'secret',
        models: ['qwen-plus'],
        defaultModel: 'qwen-plus',
      },
      shouldSetDefaultAfterCreate: true,
    },
    {
      createProvider: async () => {
        calls.push('create');
        return provider;
      },
      fetchProviders: async () => {
        calls.push('fetch');
        return [provider];
      },
      setDefaultProvider: async (id) => {
        calls.push(`default:${id}`);
      },
      updateProvider: async () => {
        throw new Error('should not update');
      },
    }
  );

  assert.deepEqual(calls, ['create', 'default:provider-1', 'fetch']);
  assert.deepEqual(result, [provider]);
});

void test('saveLlmSettingsProviderAndReload updates existing providers without reassigning default', async () => {
  const calls: string[] = [];

  const result = await saveLlmSettingsProviderAndReload(
    {
      mode: 'update',
      id: 'provider-1',
      request: {
        name: 'Qwen Prod',
        providerType: 'qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: undefined,
        models: ['qwen-plus'],
        defaultModel: 'qwen-plus',
      },
      shouldSetDefaultAfterCreate: false,
    },
    {
      createProvider: async () => {
        throw new Error('should not create');
      },
      fetchProviders: async () => {
        calls.push('fetch');
        return [provider];
      },
      setDefaultProvider: async () => {
        throw new Error('should not reset default');
      },
      updateProvider: async (id) => {
        calls.push(`update:${id}`);
        return provider;
      },
    }
  );

  assert.deepEqual(calls, ['update:provider-1', 'fetch']);
  assert.deepEqual(result, [provider]);
});

void test('deleteLlmSettingsProviderAndReload deletes then refreshes providers', async () => {
  const calls: string[] = [];

  const result = await deleteLlmSettingsProviderAndReload('provider-1', {
    deleteProvider: async (id) => {
      calls.push(`delete:${id}`);
    },
    fetchProviders: async () => {
      calls.push('fetch');
      return [];
    },
  });

  assert.deepEqual(calls, ['delete:provider-1', 'fetch']);
  assert.deepEqual(result, []);
});

void test('setDefaultLlmSettingsProviderAndReload sets default then refreshes providers', async () => {
  const calls: string[] = [];

  const result = await setDefaultLlmSettingsProviderAndReload('provider-1', {
    fetchProviders: async () => {
      calls.push('fetch');
      return [{ ...provider, isDefault: true }];
    },
    setDefaultProvider: async (id) => {
      calls.push(`default:${id}`);
    },
  });

  assert.deepEqual(calls, ['default:provider-1', 'fetch']);
  assert.deepEqual(result, [{ ...provider, isDefault: true }]);
});
