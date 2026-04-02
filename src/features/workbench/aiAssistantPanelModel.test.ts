import assert from 'node:assert/strict';
import test from 'node:test';

import type { LiveSession, LlmProvider } from './types.js';
import {
  buildAiAssistantModelOptions,
  clampAiAssistantPanelWidth,
  getDefaultAiAssistantSessionId,
  getAgentStepBudgetHint,
  getAiAssistantThemeClasses,
  getPreferredAiAssistantModelValue,
  shouldEnableAiAssistantSend,
} from './aiAssistantPanelModel.js';

const providers: LlmProvider[] = [
  {
    id: 'provider-1',
    name: 'Provider One',
    providerType: 'qwen',
    baseUrl: null,
    apiKey: '',
    hasApiKey: true,
    models: ['qwen-plus', 'qwen-max'],
    defaultModel: null,
    enabled: true,
    isDefault: false,
    maxTokens: 8192,
    temperature: 0.7,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'provider-2',
    name: 'Provider Two',
    providerType: 'deepseek',
    baseUrl: null,
    apiKey: '',
    hasApiKey: true,
    models: ['deepseek-chat'],
    defaultModel: null,
    enabled: true,
    isDefault: true,
    maxTokens: 8192,
    temperature: 0.7,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const sessions: LiveSession[] = [
  {
    id: 'session-1',
    label: 'alpha',
    host: '10.0.0.1',
    port: 22,
    username: 'root',
    authMode: 'password',
    status: 'connected',
  },
  {
    id: 'session-2',
    label: 'beta',
    host: '10.0.0.2',
    port: 22,
    username: 'root',
    authMode: 'password',
    status: 'connected',
  },
];

void test('buildAiAssistantModelOptions flattens enabled provider models into selectable values', () => {
  assert.deepEqual(buildAiAssistantModelOptions(providers), [
    {
      value: 'provider-1:qwen-plus',
      label: 'Provider One - qwen-plus',
      providerId: 'provider-1',
      modelName: 'qwen-plus',
    },
    {
      value: 'provider-1:qwen-max',
      label: 'Provider One - qwen-max',
      providerId: 'provider-1',
      modelName: 'qwen-max',
    },
    {
      value: 'provider-2:deepseek-chat',
      label: 'Provider Two - deepseek-chat',
      providerId: 'provider-2',
      modelName: 'deepseek-chat',
    },
  ]);
});

void test('getPreferredAiAssistantModelValue prefers the default enabled provider and falls back to the first enabled provider', () => {
  assert.equal(getPreferredAiAssistantModelValue(providers), 'provider-2:deepseek-chat');
  assert.equal(
    getPreferredAiAssistantModelValue([
      { ...providers[0], isDefault: false, enabled: false },
      { ...providers[1], isDefault: false, enabled: true },
    ]),
    'provider-2:deepseek-chat'
  );
  assert.equal(
    getPreferredAiAssistantModelValue([{ ...providers[0], enabled: false }]),
    ''
  );
});

void test('getPreferredAiAssistantModelValue uses provider defaultModel before falling back to the first model', () => {
  const providerWithDefaultModel = [
    {
      ...providers[0],
      isDefault: true,
      models: ['qwen-plus', 'qwen-max'],
      defaultModel: 'qwen-max',
    },
  ] as unknown as LlmProvider[];

  assert.equal(
    getPreferredAiAssistantModelValue(providerWithDefaultModel),
    'provider-1:qwen-max'
  );
});

void test('getDefaultAiAssistantSessionId prefers the active session when available', () => {
  assert.equal(getDefaultAiAssistantSessionId(sessions, 'session-2'), 'session-2');
  assert.equal(getDefaultAiAssistantSessionId(sessions, 'missing'), 'session-1');
  assert.equal(getDefaultAiAssistantSessionId([], 'missing'), null);
});

void test('clampAiAssistantPanelWidth keeps drag widths inside the supported range', () => {
  assert.equal(clampAiAssistantPanelWidth(200), 300);
  assert.equal(clampAiAssistantPanelWidth(420), 420);
  assert.equal(clampAiAssistantPanelWidth(900), 800);
});

void test('shouldEnableAiAssistantSend requires model, trimmed input, idle state and a session in agent mode', () => {
  assert.equal(
    shouldEnableAiAssistantSend({
      input: '  ',
      isBusy: false,
      mode: 'chat',
      selectedModel: 'provider-1:qwen-plus',
      selectedSessionId: null,
    }),
    false
  );

  assert.equal(
    shouldEnableAiAssistantSend({
      input: 'check disk',
      isBusy: false,
      mode: 'chat',
      selectedModel: 'provider-1:qwen-plus',
      selectedSessionId: null,
    }),
    true
  );

  assert.equal(
    shouldEnableAiAssistantSend({
      input: 'check disk',
      isBusy: false,
      mode: 'agent',
      selectedModel: 'provider-1:qwen-plus',
      selectedSessionId: null,
    }),
    false
  );
});

void test('getAgentStepBudgetHint recommends moderate budgets by default and warns on higher budgets', () => {
  assert.equal(
    getAgentStepBudgetHint(12),
    '常规任务建议 12-15 步；复杂排障再提高预算。'
  );
  assert.equal(
    getAgentStepBudgetHint(20),
    '当前为高预算模式，适合复杂排障，但会增加执行时长与 token 消耗。'
  );
});

void test('getAiAssistantThemeClasses returns readable semantic text classes in light mode', () => {
  const themeClasses = getAiAssistantThemeClasses('light');

  assert.match(themeClasses.primaryTextClass, /text-\[var\(--app-text-primary\)\]/);
  assert.match(themeClasses.secondaryTextClass, /text-\[var\(--app-text-secondary\)\]/);
  assert.doesNotMatch(themeClasses.primaryTextClass, /text-neutral-100|text-violet-50|text-sky-50/);
  assert.doesNotMatch(themeClasses.secondaryTextClass, /text-neutral-400|text-neutral-500/);
});
