import assert from 'node:assert/strict';
import test from 'node:test';

import type { LlmProvider } from './types.js';
import {
  addLlmProviderFormModel,
  buildLlmProviderBasicsSectionViewModel,
  buildInitialLlmProviderFormData,
  buildLlmProviderEditFormData,
  buildLlmProviderListItemModel,
  buildLlmProviderListSectionViewModel,
  buildLlmProviderModelSectionViewModel,
  buildLlmProviderSubmitSectionViewModel,
  buildLlmProviderSavePlan,
  canSaveLlmProviderForm,
  normalizeLlmProviderFormData,
  planLlmProviderTypeChange,
  removeLlmProviderFormModel,
} from './llmSettingsModel.js';

void test('buildInitialLlmProviderFormData seeds baseUrl and default model from the provider template', () => {
  assert.deepEqual(buildInitialLlmProviderFormData('openai_compatible'), {
    name: '',
    providerType: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: ['gpt-4.1'],
    defaultModel: 'gpt-4.1',
  });
});

void test('normalizeLlmProviderFormData trims fields, dedupes models, and appends a missing default model', () => {
  assert.deepEqual(
    normalizeLlmProviderFormData({
      name: '  Custom Provider  ',
      providerType: 'openai_compatible',
      baseUrl: ' https://llm.example.com/v1 ',
      apiKey: 'token',
      models: [' gpt-4.1 ', 'gpt-4.1', ''],
      defaultModel: 'gpt-4.1-mini',
    }),
    {
      name: 'Custom Provider',
      providerType: 'openai_compatible',
      baseUrl: 'https://llm.example.com/v1',
      apiKey: 'token',
      models: ['gpt-4.1', 'gpt-4.1-mini'],
      defaultModel: 'gpt-4.1-mini',
    }
  );
});

void test('addLlmProviderFormModel keeps the current default model and dedupes custom models', () => {
  const formData = buildInitialLlmProviderFormData('qwen');

  assert.deepEqual(addLlmProviderFormModel(formData, ' qwen-max '), {
    ...formData,
    models: ['qwen-plus', 'qwen-max'],
    defaultModel: 'qwen-plus',
  });

  assert.deepEqual(addLlmProviderFormModel(formData, 'qwen-plus'), formData);
});

void test('removeLlmProviderFormModel reassigns the default model when the current default is removed', () => {
  assert.deepEqual(
    removeLlmProviderFormModel(
      {
        name: 'Qwen',
        providerType: 'qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: '',
        models: ['qwen-plus', 'qwen-max'],
        defaultModel: 'qwen-plus',
      },
      'qwen-plus'
    ),
    {
      name: 'Qwen',
      providerType: 'qwen',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: '',
      models: ['qwen-max'],
      defaultModel: 'qwen-max',
    }
  );
});

void test('planLlmProviderTypeChange reports overwrite risk and applies the next template while preserving unrelated fields', () => {
  assert.deepEqual(
    planLlmProviderTypeChange(
      {
        name: 'Prod Provider',
        providerType: 'qwen',
        baseUrl: 'https://custom-qwen.example.com/v1',
        apiKey: 'secret',
        models: ['qwen-plus', 'qwen-max'],
        defaultModel: 'qwen-max',
      },
      'deepseek'
    ),
    {
      requiresConfirmation: true,
      nextFormData: {
        name: 'Prod Provider',
        providerType: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'secret',
        models: ['deepseek-chat'],
        defaultModel: 'deepseek-chat',
      },
    }
  );
});

void test('buildLlmProviderEditFormData prefers persisted defaultModel and falls back to the first configured model', () => {
  const provider: LlmProvider = {
    id: 'provider-1',
    name: 'Custom',
    providerType: 'openai_compatible',
    baseUrl: 'https://llm.example.com/v1',
    apiKey: '',
    hasApiKey: true,
    models: ['gpt-4.1', 'gpt-4.1-mini'],
    defaultModel: null,
    enabled: true,
    isDefault: false,
    maxTokens: 4096,
    temperature: 0.7,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  };

  assert.deepEqual(buildLlmProviderEditFormData(provider), {
    name: 'Custom',
    providerType: 'openai_compatible',
    baseUrl: 'https://llm.example.com/v1',
    apiKey: '',
    models: ['gpt-4.1', 'gpt-4.1-mini'],
    defaultModel: 'gpt-4.1',
  });
});

void test('buildLlmProviderSavePlan creates a provider payload and marks the first provider as default candidate', () => {
  assert.deepEqual(
    buildLlmProviderSavePlan(
      {
        name: '  Qwen Prod  ',
        providerType: 'qwen',
        baseUrl: ' https://dashscope.aliyuncs.com/compatible-mode/v1 ',
        apiKey: 'secret',
        models: ['qwen-plus'],
        defaultModel: 'qwen-plus',
      },
      {
        editingId: null,
        hasSavedApiKey: false,
        providerCount: 0,
      }
    ),
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
    }
  );
});

void test('buildLlmProviderSavePlan skips auto-default for non-first creates', () => {
  assert.equal(
    buildLlmProviderSavePlan(buildInitialLlmProviderFormData('deepseek'), {
      editingId: null,
      hasSavedApiKey: false,
      providerCount: 2,
    }).shouldSetDefaultAfterCreate,
    false
  );
});

void test('buildLlmProviderSavePlan omits empty apiKey during edit when an existing secret is already stored', () => {
  assert.deepEqual(
    buildLlmProviderSavePlan(
      {
        name: 'Custom',
        providerType: 'openai_compatible',
        baseUrl: 'https://llm.example.com/v1',
        apiKey: '',
        models: ['gpt-4.1', 'gpt-4.1-mini'],
        defaultModel: 'gpt-4.1-mini',
      },
      {
        editingId: 'provider-1',
        hasSavedApiKey: true,
        providerCount: 3,
      }
    ),
    {
      mode: 'update',
      id: 'provider-1',
      request: {
        name: 'Custom',
        providerType: 'openai_compatible',
        baseUrl: 'https://llm.example.com/v1',
        apiKey: undefined,
        models: ['gpt-4.1', 'gpt-4.1-mini'],
        defaultModel: 'gpt-4.1-mini',
      },
      shouldSetDefaultAfterCreate: false,
    }
  );
});

void test('canSaveLlmProviderForm requires apiKey for create and allows edit with a saved secret', () => {
  const formData = buildInitialLlmProviderFormData('qwen');

  assert.equal(
    canSaveLlmProviderForm(
      {
        ...formData,
        name: 'Qwen Prod',
        apiKey: '',
      },
      { editingId: null, hasSavedApiKey: false }
    ),
    false
  );

  assert.equal(
    canSaveLlmProviderForm(
      {
        ...formData,
        name: 'Qwen Prod',
        apiKey: '',
      },
      { editingId: 'provider-1', hasSavedApiKey: true }
    ),
    true
  );
});

void test('canSaveLlmProviderForm rejects empty baseUrl, model list, and default model', () => {
  assert.equal(
    canSaveLlmProviderForm(
      {
        name: 'Custom',
        providerType: 'openai_compatible',
        baseUrl: '',
        apiKey: 'secret',
        models: ['gpt-4.1'],
        defaultModel: 'gpt-4.1',
      },
      { editingId: null, hasSavedApiKey: false }
    ),
    false
  );

  assert.equal(
    canSaveLlmProviderForm(
      {
        name: 'Custom',
        providerType: 'openai_compatible',
        baseUrl: 'https://llm.example.com/v1',
        apiKey: 'secret',
        models: [],
        defaultModel: '',
      },
      { editingId: null, hasSavedApiKey: false }
    ),
    false
  );
});

void test('buildLlmProviderListItemModel derives provider label, baseUrl fallback, and default badges for display', () => {
  const provider: LlmProvider = {
    id: 'provider-1',
    name: 'Qwen Prod',
    providerType: 'qwen',
    baseUrl: null,
    apiKey: '',
    hasApiKey: true,
    models: ['qwen-plus', 'qwen-max'],
    defaultModel: 'qwen-max',
    enabled: true,
    isDefault: true,
    maxTokens: 4096,
    temperature: 0.7,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  };

  assert.deepEqual(buildLlmProviderListItemModel(provider), {
    id: 'provider-1',
    name: 'Qwen Prod',
    providerLabel: '通义千问',
    baseUrlLabel: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    showDefaultProviderBadge: true,
    models: [
      { name: 'qwen-plus', isDefaultModel: false, label: 'qwen-plus' },
      { name: 'qwen-max', isDefaultModel: true, label: 'qwen-max · 默认' },
    ],
  });
});

void test('buildLlmProviderModelSectionViewModel marks preset selection and selected-model default state', async () => {
  const { getLlmProviderTemplate } = await import('./llmProviderTemplates.js');

  assert.deepEqual(
    buildLlmProviderModelSectionViewModel(
      {
        name: 'Custom',
        providerType: 'qwen',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: '',
        models: ['qwen-plus', 'qwen-max'],
        defaultModel: 'qwen-max',
      },
      getLlmProviderTemplate('qwen')
    ),
    {
      presetModels: [
        { name: 'qwen-plus', selected: true },
        { name: 'qwen-turbo', selected: false },
        { name: 'qwen-max', selected: true },
      ],
      selectedModels: [
        { name: 'qwen-plus', isDefaultModel: false, label: 'qwen-plus' },
        { name: 'qwen-max', isDefaultModel: true, label: 'qwen-max' },
      ],
      emptyStateMessage: '至少保留一个模型，才能保存该提供商。',
    }
  );
});

void test('buildLlmProviderBasicsSectionViewModel exposes provider options and baseUrl hint text', async () => {
  const { getLlmProviderTemplate } = await import('./llmProviderTemplates.js');

  assert.deepEqual(
    buildLlmProviderBasicsSectionViewModel(
      {
        name: 'Custom',
        providerType: 'openai_compatible',
        baseUrl: 'https://llm.example.com/v1',
        apiKey: '',
        models: ['gpt-4.1'],
        defaultModel: 'gpt-4.1',
      },
      getLlmProviderTemplate('openai_compatible')
    ),
    {
      providerOptions: [
        { value: 'zhipu', label: '智谱 GLM' },
        { value: 'minimax', label: 'MiniMax' },
        { value: 'qwen', label: '通义千问' },
        { value: 'deepseek', label: 'DeepSeek' },
        { value: 'openai_compatible', label: 'OpenAI-compatible / 自定义' },
      ],
      baseUrlPlaceholder: 'https://api.openai.com/v1',
      baseUrlHint: '当前提供商默认地址：https://api.openai.com/v1',
    }
  );
});

void test('buildLlmProviderListSectionViewModel exposes empty-state copy and mapped items', () => {
  const provider: LlmProvider = {
    id: 'provider-1',
    name: 'Qwen Prod',
    providerType: 'qwen',
    baseUrl: null,
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

  assert.deepEqual(buildLlmProviderListSectionViewModel([]), {
    emptyTitle: '暂无配置',
    emptyDescription: '请在下方添加 LLM 提供商',
    items: [],
  });

  assert.deepEqual(buildLlmProviderListSectionViewModel([provider]), {
    emptyTitle: '暂无配置',
    emptyDescription: '请在下方添加 LLM 提供商',
    items: [buildLlmProviderListItemModel(provider)],
  });
});

void test('buildLlmProviderSubmitSectionViewModel exposes api key placeholder and action labels for create and edit flows', () => {
  assert.deepEqual(
    buildLlmProviderSubmitSectionViewModel({
      editing: false,
      hasSavedApiKey: false,
    }),
    {
      apiKeyPlaceholder: '输入 API Key',
      primaryActionLabel: '添加提供商',
      showCancelAction: false,
    }
  );

  assert.deepEqual(
    buildLlmProviderSubmitSectionViewModel({
      editing: true,
      hasSavedApiKey: true,
    }),
    {
      apiKeyPlaceholder: '留空则保留现有 API Key',
      primaryActionLabel: '保存',
      showCancelAction: true,
    }
  );
});
