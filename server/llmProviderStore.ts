import { randomUUID } from 'node:crypto';

import { getSqliteDatabase, type SqlDatabaseHandle, type SqlRow, type SqlParams } from './database.js';
import { getSecretVault } from './secretVault.js';

export type LlmProviderType = 'zhipu' | 'minimax' | 'qwen' | 'deepseek' | 'openai_compatible';

export type StoredLlmProvider = {
  id: string;
  name: string;
  providerType: LlmProviderType;
  baseUrl: string | null;
  apiKey: string;
  hasApiKey: boolean;
  models: string[];
  defaultModel: string | null;
  enabled: boolean;
  isDefault: boolean;
  maxTokens: number;
  temperature: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredLlmProviderWithApiKey = {
  id: string;
  name: string;
  providerType: LlmProviderType;
  baseUrl: string | null;
  apiKey: string; // 已解密
  hasApiKey: boolean;
  models: string[];
  defaultModel: string | null;
  enabled: boolean;
  isDefault: boolean;
  maxTokens: number;
  temperature: number;
  createdAt: string;
  updatedAt: string;
};

export type LlmProviderInput = {
  name: string;
  providerType: LlmProviderType;
  baseUrl?: string;
  apiKey: string;
  models: string[];
  defaultModel?: string;
  maxTokens?: number;
  temperature?: number;
};

export const PRESET_MODELS = {
  zhipu: [
    { value: 'glm-4-plus', label: 'GLM-4 Plus（推荐）', maxTokens: 8192 },
    { value: 'glm-4-air', label: 'GLM-4 Air（快速）', maxTokens: 8192 },
    { value: 'glm-4-flash', label: 'GLM-4 Flash（极速）', maxTokens: 8192 },
  ],
  minimax: [
    { value: 'abab6.5-chat', label: 'MiniMax-6.5（推荐）', maxTokens: 8192 },
    { value: 'abab6.5s-chat', label: 'MiniMax-6.5s（快速）', maxTokens: 8192 },
  ],
  qwen: [
    { value: 'qwen-plus', label: 'Qwen Plus（推荐）', maxTokens: 8192 },
    { value: 'qwen-turbo', label: 'Qwen Turbo（快速）', maxTokens: 8192 },
    { value: 'qwen-max', label: 'Qwen Max（最强）', maxTokens: 8192 },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat（推荐）', maxTokens: 8192 },
    { value: 'deepseek-coder', label: 'DeepSeek Coder（代码）', maxTokens: 8192 },
  ],
  openai_compatible: [
    { value: 'gpt-4.1', label: 'GPT-4.1（推荐）', maxTokens: 32768 },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini（快速）', maxTokens: 32768 },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini（轻量）', maxTokens: 16384 },
  ],
} as const;

export const PROVIDER_BASE_URLS = {
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com',
  openai_compatible: 'https://api.openai.com/v1',
} as const;

let vaultInstance: Awaited<ReturnType<typeof getSecretVault>> | null = null;

async function getVault() {
  if (!vaultInstance) {
    vaultInstance = await getSecretVault();
  }
  return vaultInstance;
}

function normalizeModels(models: string[]) {
  return Array.from(
    new Set(
      models
        .map((model) => model.trim())
        .filter(Boolean)
    )
  );
}

function normalizeProviderConfig(input: {
  providerType: LlmProviderType;
  baseUrl?: string | null;
  models: string[];
  defaultModel?: string | null;
}) {
  const models = normalizeModels(input.models);
  const rawDefaultModel = input.defaultModel?.trim() ?? '';
  const defaultModel = rawDefaultModel || models[0] || null;

  if (defaultModel && !models.includes(defaultModel)) {
    models.push(defaultModel);
  }

  return {
    baseUrl: input.baseUrl?.trim() || PROVIDER_BASE_URLS[input.providerType],
    models,
    defaultModel: defaultModel ?? null,
  };
}

function mapProviderRow(row: SqlRow): StoredLlmProviderWithApiKey {
  const vault = vaultInstance!;
  const encryptedKey = row.api_key as string | null;
  const modelsJson = row.models as string | null;
  const parsedModels: unknown = modelsJson ? JSON.parse(modelsJson) : [];
  const models =
    Array.isArray(parsedModels) && parsedModels.every((item) => typeof item === 'string')
      ? parsedModels
      : [];
  const fallbackDefaultModel = typeof row.model === 'string' && row.model.trim() ? row.model.trim() : models[0] ?? null;
  const normalizedDefaultModel =
    (typeof row.default_model === 'string' && row.default_model.trim()
      ? row.default_model.trim()
      : fallbackDefaultModel);
  const normalizedModels =
    normalizedDefaultModel && !models.includes(normalizedDefaultModel)
      ? [...models, normalizedDefaultModel]
      : models;
  const baseUrl =
    (typeof row.base_url === 'string' && row.base_url.trim()
      ? row.base_url.trim()
      : PROVIDER_BASE_URLS[row.provider_type as LlmProviderType]) ?? null;
  return {
    id: row.id as string,
    name: row.name as string,
    providerType: row.provider_type as LlmProviderType,
    baseUrl,
    apiKey: (encryptedKey ? vault.decrypt(encryptedKey) : null) ?? '',
    hasApiKey: true,
    models: normalizedModels,
    defaultModel: normalizedDefaultModel,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    maxTokens: (row.max_tokens as number) || 4096,
    temperature: (row.temperature as number) || 0.7,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function sanitizeProvider(provider: StoredLlmProviderWithApiKey): StoredLlmProvider {
  return {
    ...provider,
    apiKey: '',
    hasApiKey: Boolean(provider.apiKey),
  };
}

function queryProviders(database: SqlDatabaseHandle, sql: string, params?: SqlParams): StoredLlmProviderWithApiKey[] {
  const result = database.exec(sql, params);
  if (!result[0]) return [];

  const { columns, values } = result[0];
  return values.map(row => {
    const obj: SqlRow = {};
    columns.forEach((col, i) => {
      obj[col] = row[i] ?? null;
    });
    return mapProviderRow(obj);
  });
}

export async function createLlmProviderStore() {
  const { database, persist } = await getSqliteDatabase();
  await getVault(); // 初始化 vaultInstance

  function listProviders(): StoredLlmProvider[] {
    return queryProviders(database, 'SELECT * FROM llm_providers ORDER BY is_default DESC, created_at DESC')
      .map(sanitizeProvider);
  }

  function getProvider(id: string): StoredLlmProvider | null {
    const providers = queryProviders(database, 'SELECT * FROM llm_providers WHERE id = :id', { ':id': id });
    const provider = providers[0];
    return provider ? sanitizeProvider(provider) : null;
  }

  function getProviderWithApiKey(id: string): StoredLlmProviderWithApiKey | null {
    const providers = queryProviders(database, 'SELECT * FROM llm_providers WHERE id = :id', { ':id': id });
    return providers[0] ?? null;
  }

  function getDefaultProvider(): StoredLlmProvider | null {
    const providers = queryProviders(database, 'SELECT * FROM llm_providers WHERE is_default = 1 AND enabled = 1 LIMIT 1');
    const provider = providers[0];
    return provider ? sanitizeProvider(provider) : null;
  }

  function createProvider(input: LlmProviderInput): StoredLlmProvider {
    const id = randomUUID();
    const now = new Date().toISOString();
    const encryptedApiKey = input.apiKey ? vaultInstance!.encrypt(input.apiKey) : null;
    const normalized = normalizeProviderConfig(input);
    const modelsJson = JSON.stringify(normalized.models);
    const primaryModel = normalized.defaultModel ?? '';

    database.run(
      `INSERT INTO llm_providers (
        id, name, provider_type, base_url, api_key, model, models, default_model,
        enabled, is_default, max_tokens, temperature, created_at, updated_at
      ) VALUES (
        :id, :name, :providerType, :baseUrl, :apiKey, :model, :models, :defaultModel,
        1, 0, :maxTokens, :temperature, :createdAt, :updatedAt
      )`,
      {
        ':id': id,
        ':name': input.name,
        ':providerType': input.providerType,
        ':baseUrl': normalized.baseUrl,
        ':apiKey': encryptedApiKey,
        ':model': primaryModel,
        ':models': modelsJson,
        ':defaultModel': normalized.defaultModel,
        ':maxTokens': input.maxTokens ?? 4096,
        ':temperature': input.temperature ?? 0.7,
        ':createdAt': now,
        ':updatedAt': now,
      }
    );

    void persist();
    return getProvider(id)!;
  }

  function updateProvider(id: string, input: Partial<LlmProviderInput>): StoredLlmProvider | null {
    const existing = getProviderWithApiKey(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: SqlParams = { ':id': id, ':updatedAt': now };

    const nextProviderType = input.providerType ?? existing.providerType;
    const nextConfig = normalizeProviderConfig({
      providerType: nextProviderType,
      baseUrl:
        input.baseUrl !== undefined
          ? input.baseUrl
          : input.providerType !== undefined
            ? undefined
          : existing.baseUrl,
      models: input.models ?? existing.models,
      defaultModel: input.defaultModel ?? existing.defaultModel,
    });

    if (input.name !== undefined) {
      updates.push('name = :name');
      params[':name'] = input.name;
    }
    if (input.providerType !== undefined) {
      updates.push('provider_type = :providerType');
      params[':providerType'] = input.providerType;
    }
    if (input.baseUrl !== undefined) {
      updates.push('base_url = :baseUrl');
      params[':baseUrl'] = nextConfig.baseUrl;
    }
    if (input.apiKey !== undefined) {
      updates.push('api_key = :apiKey');
      params[':apiKey'] = input.apiKey ? vaultInstance!.encrypt(input.apiKey) : null;
    }
    if (input.models !== undefined || input.defaultModel !== undefined) {
      updates.push('model = :model');
      updates.push('models = :models');
      updates.push('default_model = :defaultModel');
      params[':model'] = nextConfig.defaultModel ?? '';
      params[':models'] = JSON.stringify(nextConfig.models);
      params[':defaultModel'] = nextConfig.defaultModel;
    }
    if (input.maxTokens !== undefined) {
      updates.push('max_tokens = :maxTokens');
      params[':maxTokens'] = input.maxTokens;
    }
    if (input.temperature !== undefined) {
      updates.push('temperature = :temperature');
      params[':temperature'] = input.temperature;
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = :updatedAt');
    database.run(`UPDATE llm_providers SET ${updates.join(', ')} WHERE id = :id`, params);
    void persist();
    return getProvider(id);
  }

  function deleteProvider(id: string): void {
    database.run('DELETE FROM llm_providers WHERE id = :id', { ':id': id });
    void persist();
  }

  function setDefaultProvider(id: string): void {
    if (!getProviderWithApiKey(id)) {
      throw new Error('LLM 配置不存在。');
    }

    database.run('UPDATE llm_providers SET is_default = 0');
    database.run('UPDATE llm_providers SET is_default = 1 WHERE id = :id', { ':id': id });
    void persist();
  }

  return {
    listProviders,
    getProvider,
    getProviderWithApiKey,
    getDefaultProvider,
    createProvider,
    updateProvider,
    deleteProvider,
    setDefaultProvider,
  };
}
