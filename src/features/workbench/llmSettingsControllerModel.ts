import type { LlmProvider } from './types.js';
import type { LlmProviderUpsertInput } from './api.js';

type LlmSettingsSavePlan =
  | {
      mode: 'create';
      request: LlmProviderUpsertInput;
      shouldSetDefaultAfterCreate: boolean;
    }
  | {
      mode: 'update';
      id: string;
      request: Partial<LlmProviderUpsertInput>;
      shouldSetDefaultAfterCreate: boolean;
    };

export async function loadLlmSettingsProviders(input: {
  fetchProviders: () => Promise<LlmProvider[]>;
}) {
  return input.fetchProviders();
}

export async function saveLlmSettingsProviderAndReload(
  plan: LlmSettingsSavePlan,
  input: {
    createProvider: (request: LlmProviderUpsertInput) => Promise<LlmProvider>;
    fetchProviders: () => Promise<LlmProvider[]>;
    setDefaultProvider: (id: string) => Promise<void>;
    updateProvider: (id: string, request: Partial<LlmProviderUpsertInput>) => Promise<LlmProvider>;
  }
) {
  if (plan.mode === 'update') {
    await input.updateProvider(plan.id, plan.request);
    return input.fetchProviders();
  }

  const createdProvider = await input.createProvider(plan.request);
  if (plan.shouldSetDefaultAfterCreate) {
    await input.setDefaultProvider(createdProvider.id);
  }
  return input.fetchProviders();
}

export async function deleteLlmSettingsProviderAndReload(
  id: string,
  input: {
    deleteProvider: (id: string) => Promise<void>;
    fetchProviders: () => Promise<LlmProvider[]>;
  }
) {
  await input.deleteProvider(id);
  return input.fetchProviders();
}

export async function setDefaultLlmSettingsProviderAndReload(
  id: string,
  input: {
    fetchProviders: () => Promise<LlmProvider[]>;
    setDefaultProvider: (id: string) => Promise<void>;
  }
) {
  await input.setDefaultProvider(id);
  return input.fetchProviders();
}

export function buildLlmSettingsResetState() {
  return {
    editing: null as string | null,
    hasSavedApiKey: false,
    customModelInput: '',
  };
}

export function buildLlmSettingsProviderTypeChangeConfirmMessage() {
  return '切换提供商会覆盖当前 base URL 和模型设置，是否继续？';
}

export function buildLlmSettingsLoadingErrorMessage() {
  return 'LLM 配置读取失败。';
}

export function buildLlmSettingsSaveErrorMessage() {
  return 'LLM 配置保存失败。';
}

export function buildLlmSettingsDeleteErrorMessage() {
  return 'LLM 配置删除失败。';
}

export function buildLlmSettingsSetDefaultErrorMessage() {
  return '默认 LLM 设置失败。';
}
