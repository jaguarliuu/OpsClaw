import type { LlmProviderType } from './types';

export type LlmProviderTemplate = {
  type: LlmProviderType;
  label: string;
  defaultBaseUrl: string;
  presetModels: string[];
};

export const LLM_PROVIDER_TEMPLATES: Record<LlmProviderType, LlmProviderTemplate> = {
  zhipu: {
    type: 'zhipu',
    label: '智谱 GLM',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    presetModels: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'],
  },
  minimax: {
    type: 'minimax',
    label: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    presetModels: ['abab6.5-chat', 'abab6.5s-chat'],
  },
  qwen: {
    type: 'qwen',
    label: '通义千问',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    presetModels: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
  },
  deepseek: {
    type: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    presetModels: ['deepseek-chat', 'deepseek-coder'],
  },
  openai_compatible: {
    type: 'openai_compatible',
    label: 'OpenAI-compatible / 自定义',
    defaultBaseUrl: 'https://api.openai.com/v1',
    presetModels: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
  },
};

export const LLM_PROVIDER_ORDER = Object.keys(LLM_PROVIDER_TEMPLATES) as LlmProviderType[];

export function getLlmProviderTemplate(providerType: LlmProviderType) {
  return LLM_PROVIDER_TEMPLATES[providerType];
}

export function getLlmProviderLabel(providerType: LlmProviderType) {
  return getLlmProviderTemplate(providerType).label;
}
