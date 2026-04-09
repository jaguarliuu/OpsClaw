import assert from 'node:assert/strict';
import test from 'node:test';

import type { LiveSession, LlmProvider } from './types.js';
import type { InteractionRequest } from './types.agent.js';
import {
  createAiAssistantInputImeState,
  buildAiAssistantModelOptions,
  clampAiAssistantPanelWidth,
  getDefaultAiAssistantSessionId,
  getAiAssistantHeaderActionsState,
  getAiAssistantPrimaryActionState,
  getAgentStepBudgetHint,
  getAiAssistantThemeClasses,
  getPreferredAiAssistantModelValue,
  markAiAssistantInputCompositionEnd,
  markAiAssistantInputCompositionStart,
  shouldAutoScrollAiAssistantTimeline,
  getValidAiAssistantModelValue,
  getValidAiAssistantSessionId,
  shouldEnableAiAssistantSend,
  shouldPresentAiAssistantInteractionDialog,
  shouldSubmitAiAssistantOnEnter,
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

function makeInteractionRequest(
  overrides: Partial<InteractionRequest> = {}
): InteractionRequest {
  return {
    id: 'interaction-1',
    runId: 'run-1',
    sessionId: 'session-1',
    status: 'open',
    interactionKind: 'collect_input',
    riskLevel: 'medium',
    blockingMode: 'soft_block',
    title: '补充参数',
    message: '请输入用户名。',
    schemaVersion: 'v1',
    fields: [],
    actions: [],
    openedAt: 1,
    deadlineAt: null,
    metadata: {},
    ...overrides,
  };
}

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

void test('getValidAiAssistantModelValue preserves the current model when it still exists and falls back when it does not', () => {
  const options = buildAiAssistantModelOptions(providers);

  assert.equal(
    getValidAiAssistantModelValue(options, 'provider-2:deepseek-chat'),
    'provider-2:deepseek-chat'
  );
  assert.equal(
    getValidAiAssistantModelValue(options, 'missing:model'),
    'provider-1:qwen-plus'
  );
  assert.equal(getValidAiAssistantModelValue([], 'missing:model'), '');
});

void test('getValidAiAssistantSessionId preserves the current session when available and restores a default when it is missing', () => {
  assert.equal(
    getValidAiAssistantSessionId(sessions, 'session-2', 'session-1'),
    'session-2'
  );
  assert.equal(
    getValidAiAssistantSessionId(sessions, 'missing', 'session-2'),
    'session-2'
  );
  assert.equal(getValidAiAssistantSessionId([], 'missing', 'session-2'), null);
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

void test('shouldPresentAiAssistantInteractionDialog only opens native cards for open non-terminal interactions', () => {
  assert.equal(
    shouldPresentAiAssistantInteractionDialog(makeInteractionRequest()),
    true
  );

  assert.equal(
    shouldPresentAiAssistantInteractionDialog(
      makeInteractionRequest({ interactionKind: 'approval', riskLevel: 'high' })
    ),
    true
  );

  assert.equal(
    shouldPresentAiAssistantInteractionDialog(
      makeInteractionRequest({ interactionKind: 'terminal_wait' })
    ),
    false
  );

  assert.equal(
    shouldPresentAiAssistantInteractionDialog(
      makeInteractionRequest({ status: 'resolved' })
    ),
    false
  );

  assert.equal(shouldPresentAiAssistantInteractionDialog(null), false);
});

void test('shouldSubmitAiAssistantOnEnter ignores Shift+Enter and IME confirmation Enter', () => {
  assert.equal(
    shouldSubmitAiAssistantOnEnter({
      event: {
        isComposing: false,
        key: 'Enter',
        keyCode: 13,
        shiftKey: false,
      },
      imeState: createAiAssistantInputImeState(),
      now: 0,
    }),
    true
  );

  assert.equal(
    shouldSubmitAiAssistantOnEnter({
      event: {
        isComposing: false,
        key: 'Enter',
        keyCode: 13,
        shiftKey: true,
      },
      imeState: createAiAssistantInputImeState(),
      now: 0,
    }),
    false
  );

  assert.equal(
    shouldSubmitAiAssistantOnEnter({
      event: {
        isComposing: true,
        key: 'Enter',
        keyCode: 13,
        shiftKey: false,
      },
      imeState: createAiAssistantInputImeState(),
      now: 0,
    }),
    false
  );

  const composingState = markAiAssistantInputCompositionStart(createAiAssistantInputImeState());
  const endedState = markAiAssistantInputCompositionEnd(composingState, 100);

  assert.equal(
    shouldSubmitAiAssistantOnEnter({
      event: {
        isComposing: false,
        key: 'Enter',
        keyCode: 13,
        shiftKey: false,
      },
      imeState: endedState,
      now: 110,
    }),
    false
  );

  assert.equal(
    shouldSubmitAiAssistantOnEnter({
      event: {
        isComposing: false,
        key: 'Enter',
        keyCode: 13,
        shiftKey: false,
      },
      imeState: endedState,
      now: 500,
    }),
    true
  );
});

void test('getAgentStepBudgetHint recommends moderate budgets by default and warns on higher budgets', () => {
  assert.equal(
    getAgentStepBudgetHint(24),
    '常规任务建议 18-24 步；复杂排障再提高预算。'
  );
  assert.equal(
    getAgentStepBudgetHint(30),
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

void test('getAiAssistantHeaderActionsState keeps stop out of the header and preserves the new-conversation tooltip state', () => {
  assert.deepEqual(getAiAssistantHeaderActionsState(false), {
    showStopAction: false,
    newConversationTitle: '请先处理当前等待中的交互卡片',
  });

  assert.deepEqual(getAiAssistantHeaderActionsState(true), {
    showStopAction: false,
    newConversationTitle: '新对话',
  });
});

void test('getAiAssistantPrimaryActionState switches the composer button to stop while busy', () => {
  assert.deepEqual(
    getAiAssistantPrimaryActionState({
      isBusy: false,
      canSend: true,
      isAgentInputLocked: false,
    }),
    {
      kind: 'send',
      disabled: false,
      title: '发送',
      ariaLabel: '发送',
    }
  );

  assert.deepEqual(
    getAiAssistantPrimaryActionState({
      isBusy: false,
      canSend: false,
      isAgentInputLocked: true,
    }),
    {
      kind: 'send',
      disabled: true,
      title: '发送',
      ariaLabel: '发送',
    }
  );

  assert.deepEqual(
    getAiAssistantPrimaryActionState({
      isBusy: true,
      canSend: false,
      isAgentInputLocked: true,
    }),
    {
      kind: 'stop',
      disabled: false,
      title: '停止',
      ariaLabel: '停止当前运行',
    }
  );
});

void test('shouldAutoScrollAiAssistantTimeline scrolls when the panel opens, mode changes, or new visible items arrive', () => {
  assert.equal(
    shouldAutoScrollAiAssistantTimeline({
      open: true,
      previousOpen: false,
      mode: 'chat',
      previousMode: 'chat',
      visibleContentSignature: '4:4:4:4',
      previousVisibleContentSignature: '4:4:4:4',
      visibleItemCount: 4,
      previousVisibleItemCount: 4,
    }),
    true
  );

  assert.equal(
    shouldAutoScrollAiAssistantTimeline({
      open: true,
      previousOpen: true,
      mode: 'agent',
      previousMode: 'chat',
      visibleContentSignature: '3:3:3',
      previousVisibleContentSignature: '3:3:3',
      visibleItemCount: 3,
      previousVisibleItemCount: 3,
    }),
    true
  );

  assert.equal(
    shouldAutoScrollAiAssistantTimeline({
      open: true,
      previousOpen: true,
      mode: 'chat',
      previousMode: 'chat',
      visibleContentSignature: '5:5:5:5:5',
      previousVisibleContentSignature: '4:4:4:4',
      visibleItemCount: 5,
      previousVisibleItemCount: 4,
    }),
    true
  );

  assert.equal(
    shouldAutoScrollAiAssistantTimeline({
      open: true,
      previousOpen: true,
      mode: 'agent',
      previousMode: 'agent',
      visibleContentSignature: '12',
      previousVisibleContentSignature: '6',
      visibleItemCount: 1,
      previousVisibleItemCount: 1,
    }),
    true
  );

  assert.equal(
    shouldAutoScrollAiAssistantTimeline({
      open: false,
      previousOpen: true,
      mode: 'chat',
      previousMode: 'chat',
      visibleContentSignature: '5:5:5:5:5',
      previousVisibleContentSignature: '4:4:4:4',
      visibleItemCount: 5,
      previousVisibleItemCount: 4,
    }),
    false
  );
});
