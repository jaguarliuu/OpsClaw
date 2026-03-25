import { randomUUID } from 'node:crypto';

import { getSqliteDatabase, type SqlDatabaseHandle, type SqlRow, type SqlParams } from './database.js';
import { getSecretVault } from "./secretVault.js";

export type LlmProviderType = 'zhipu' | 'minimax' | 'qwen' | 'deepseek';

export type StoredLlmProvider = {
  id: string;
  name: string;
  providerType: LlmProviderType;
  baseUrl: string | null;
  apiKey: string; // 已解密
  model: string;
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
  model: string;
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
} as const;

export const PROVIDER_BASE_URLS = {
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com',
} as const;

let vaultInstance: Awaited<ReturnType<typeof getSecretVault>> | null = null;

async function getVault() {
  if (!vaultInstance) {
    vaultInstance = await getSecretVault();
  }
  return vaultInstance;
}

function mapProviderRow(row: SqlRow): StoredLlmProvider {
  const vault = vaultInstance!;
  const encryptedKey = row.api_key as string | null;
  return {
    id: row.id as string,
    name: row.name as string,
    providerType: row.provider_type as LlmProviderType,
    baseUrl: row.base_url as string | null,
    apiKey: (encryptedKey ? vault.decrypt(encryptedKey) : null) ?? '',
    model: row.model as string,
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    maxTokens: (row.max_tokens as number) || 4096,
    temperature: (row.temperature as number) || 0.7,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function queryProviders(database: SqlDatabaseHandle, sql: string, params?: SqlParams): StoredLlmProvider[] {
  const result = database.exec(sql, params);
  if (!result[0]) return [];

  const { columns, values } = result[0];
  return values.map(row => {
    const obj: SqlRow = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return mapProviderRow(obj);
  });
}

export async function createLlmProviderStore() {
  const { database, persist } = await getSqliteDatabase();
  await getVault(); // 初始化 vaultInstance

  function listProviders(): StoredLlmProvider[] {
    return queryProviders(database, 'SELECT * FROM llm_providers ORDER BY is_default DESC, created_at DESC');
  }

  function getProvider(id: string): StoredLlmProvider | null {
    const providers = queryProviders(database, 'SELECT * FROM llm_providers WHERE id = :id', { ':id': id });
    return providers[0] ?? null;
  }

  function getDefaultProvider(): StoredLlmProvider | null {
    const providers = queryProviders(database, 'SELECT * FROM llm_providers WHERE is_default = 1 AND enabled = 1 LIMIT 1');
    return providers[0] ?? null;
  }

  function createProvider(input: LlmProviderInput): StoredLlmProvider {
    const id = randomUUID();
    const now = new Date().toISOString();
    const encryptedApiKey = input.apiKey ? vaultInstance!.encrypt(input.apiKey) : null;

    database.run(
      `INSERT INTO llm_providers (
        id, name, provider_type, base_url, api_key, model,
        enabled, is_default, max_tokens, temperature, created_at, updated_at
      ) VALUES (
        :id, :name, :providerType, :baseUrl, :apiKey, :model,
        1, 0, :maxTokens, :temperature, :createdAt, :updatedAt
      )`,
      {
        ':id': id,
        ':name': input.name,
        ':providerType': input.providerType,
        ':baseUrl': input.baseUrl ?? null,
        ':apiKey': encryptedApiKey,
        ':model': input.model,
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
    const existing = getProvider(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: SqlParams = { ':id': id, ':updatedAt': now };

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
      params[':baseUrl'] = input.baseUrl || null;
    }
    if (input.apiKey !== undefined) {
      updates.push('api_key = :apiKey');
      params[':apiKey'] = input.apiKey ? vaultInstance!.encrypt(input.apiKey) : null;
    }
    if (input.model !== undefined) {
      updates.push('model = :model');
      params[':model'] = input.model;
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
    database.run('UPDATE llm_providers SET is_default = 0');
    database.run('UPDATE llm_providers SET is_default = 1 WHERE id = :id', { ':id': id });
    void persist();
  }

  return {
    listProviders,
    getProvider,
    getDefaultProvider,
    createProvider,
    updateProvider,
    deleteProvider,
    setDefaultProvider,
  };
}
