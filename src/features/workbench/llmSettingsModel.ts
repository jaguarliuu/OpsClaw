import {
  LLM_PROVIDER_ORDER,
  type LlmProviderTemplate,
  getLlmProviderLabel,
  getLlmProviderTemplate,
} from './llmProviderTemplates.js';
import type { LlmProviderUpsertInput } from './api.js';
import type { LlmProvider, LlmProviderType } from './types.js';

export type LlmProviderFormData = {
  name: string;
  providerType: LlmProviderType;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
};

export const DEFAULT_LLM_PROVIDER_TYPE: LlmProviderType = 'zhipu';

function dedupeModels(models: string[]) {
  return Array.from(
    new Set(
      models
        .map((model) => model.trim())
        .filter(Boolean)
    )
  );
}

export function buildInitialLlmProviderFormData(
  providerType: LlmProviderType = DEFAULT_LLM_PROVIDER_TYPE
): LlmProviderFormData {
  const template = getLlmProviderTemplate(providerType);
  const defaultModel = template.presetModels[0] ?? '';

  return {
    name: '',
    providerType,
    baseUrl: template.defaultBaseUrl,
    apiKey: '',
    models: defaultModel ? [defaultModel] : [],
    defaultModel,
  };
}

export function normalizeLlmProviderFormData(formData: LlmProviderFormData): LlmProviderFormData {
  const models = dedupeModels(formData.models);
  const defaultModel = formData.defaultModel.trim() || models[0] || '';

  if (defaultModel && !models.includes(defaultModel)) {
    models.push(defaultModel);
  }

  return {
    ...formData,
    name: formData.name.trim(),
    baseUrl: formData.baseUrl.trim(),
    models,
    defaultModel,
  };
}

export function addLlmProviderFormModel(formData: LlmProviderFormData, modelName: string) {
  const value = modelName.trim();
  if (!value) {
    return formData;
  }

  const nextModels = dedupeModels([...formData.models, value]);
  const nextDefaultModel =
    formData.defaultModel && nextModels.includes(formData.defaultModel)
      ? formData.defaultModel
      : value;

  return {
    ...formData,
    models: nextModels,
    defaultModel: nextDefaultModel,
  };
}

export function removeLlmProviderFormModel(formData: LlmProviderFormData, modelName: string) {
  const nextModels = formData.models.filter((model) => model !== modelName);
  const nextDefaultModel =
    formData.defaultModel === modelName ? nextModels[0] ?? '' : formData.defaultModel;

  return {
    ...formData,
    models: nextModels,
    defaultModel: nextDefaultModel,
  };
}

function areModelListsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function planLlmProviderTypeChange(
  formData: LlmProviderFormData,
  nextProviderType: LlmProviderType
) {
  const nextDefaults = buildInitialLlmProviderFormData(nextProviderType);

  return {
    requiresConfirmation:
      formData.baseUrl !== nextDefaults.baseUrl ||
      formData.defaultModel !== nextDefaults.defaultModel ||
      !areModelListsEqual(formData.models, nextDefaults.models),
    nextFormData: {
      ...formData,
      providerType: nextProviderType,
      baseUrl: nextDefaults.baseUrl,
      models: nextDefaults.models,
      defaultModel: nextDefaults.defaultModel,
    },
  };
}

export function buildLlmProviderEditFormData(provider: LlmProvider): LlmProviderFormData {
  const template = getLlmProviderTemplate(provider.providerType);

  return {
    name: provider.name,
    providerType: provider.providerType,
    baseUrl: provider.baseUrl ?? template.defaultBaseUrl,
    apiKey: '',
    models: provider.models,
    defaultModel: provider.defaultModel ?? provider.models[0] ?? '',
  };
}

export function buildLlmProviderSavePlan(
  formData: LlmProviderFormData,
  options: {
    editingId: string | null;
    hasSavedApiKey: boolean;
    providerCount: number;
  }
) {
  const normalized = normalizeLlmProviderFormData(formData);
  const request: LlmProviderUpsertInput = {
    name: normalized.name,
    providerType: normalized.providerType,
    baseUrl: normalized.baseUrl,
    apiKey: normalized.apiKey,
    models: normalized.models,
    defaultModel: normalized.defaultModel,
  };

  if (options.editingId) {
    return {
      mode: 'update' as const,
      id: options.editingId,
      request: {
        ...request,
        apiKey: normalized.apiKey || (options.hasSavedApiKey ? undefined : ''),
      },
      shouldSetDefaultAfterCreate: false,
    };
  }

  return {
    mode: 'create' as const,
    request,
    shouldSetDefaultAfterCreate: options.providerCount === 0,
  };
}

export function canSaveLlmProviderForm(
  formData: LlmProviderFormData,
  options: {
    editingId: string | null;
    hasSavedApiKey: boolean;
  }
) {
  const normalized = normalizeLlmProviderFormData(formData);

  return (
    Boolean(normalized.name) &&
    Boolean(normalized.baseUrl) &&
    normalized.models.length > 0 &&
    Boolean(normalized.defaultModel) &&
    ((!options.editingId && Boolean(normalized.apiKey)) ||
      (Boolean(options.editingId) &&
        (Boolean(normalized.apiKey) || options.hasSavedApiKey)))
  );
}

export function buildLlmProviderListItemModel(provider: LlmProvider) {
  const template = getLlmProviderTemplate(provider.providerType);
  const baseUrlLabel = provider.baseUrl ?? template.defaultBaseUrl;

  return {
    id: provider.id,
    name: provider.name,
    providerLabel: getLlmProviderLabel(provider.providerType),
    baseUrlLabel,
    showDefaultProviderBadge: provider.isDefault,
    models: provider.models.map((model) => ({
      name: model,
      isDefaultModel: provider.defaultModel === model,
      label: provider.defaultModel === model ? `${model} · 默认` : model,
    })),
  };
}

export function buildLlmProviderModelSectionViewModel(
  formData: LlmProviderFormData,
  template: LlmProviderTemplate
) {
  return {
    presetModels: template.presetModels.map((model) => ({
      name: model,
      selected: formData.models.includes(model),
    })),
    selectedModels: formData.models.map((model) => ({
      name: model,
      isDefaultModel: formData.defaultModel === model,
      label: formData.defaultModel === model ? `${model}` : model,
    })),
    emptyStateMessage: '至少保留一个模型，才能保存该提供商。',
  };
}

export function buildLlmProviderBasicsSectionViewModel(
  _formData: LlmProviderFormData,
  template: LlmProviderTemplate
) {
  return {
    providerOptions: LLM_PROVIDER_ORDER.map((providerType) => ({
      value: providerType,
      label: getLlmProviderLabel(providerType),
    })),
    baseUrlPlaceholder: template.defaultBaseUrl,
    baseUrlHint: `当前提供商默认地址：${template.defaultBaseUrl}`,
  };
}

export function buildLlmProviderListSectionViewModel(providers: LlmProvider[]) {
  return {
    emptyTitle: '暂无配置',
    emptyDescription: '请在下方添加 LLM 提供商',
    items: providers.map((provider) => buildLlmProviderListItemModel(provider)),
  };
}

export function buildLlmProviderSubmitSectionViewModel(input: {
  editing: boolean;
  hasSavedApiKey: boolean;
}) {
  return {
    apiKeyPlaceholder:
      input.editing && input.hasSavedApiKey
        ? '留空则保留现有 API Key'
        : '输入 API Key',
    primaryActionLabel: input.editing ? '保存' : '添加提供商',
    showCancelAction: input.editing,
  };
}
