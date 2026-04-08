import type { InteractionRequest } from './types.agent';
import type { LiveSession, LlmProvider } from './types';

export type AiAssistantMode = 'agent' | 'chat';
export type AiAssistantInputImeState = {
  isComposing: boolean;
  suppressEnterUntil: number;
};

type AiAssistantInputEnterEvent = {
  isComposing?: boolean;
  key: string;
  keyCode?: number;
  shiftKey: boolean;
};

type ShouldSubmitAiAssistantOnEnterInput = {
  event: AiAssistantInputEnterEvent;
  imeState: AiAssistantInputImeState;
  now: number;
};

export type AiAssistantModelOption = {
  value: string;
  label: string;
  providerId: string;
  modelName: string;
};

export type AiAssistantThemeMode = 'dark' | 'light';

export const AI_ASSISTANT_PANEL_MIN_WIDTH = 300;
export const AI_ASSISTANT_PANEL_MAX_WIDTH = 800;
export const AI_ASSISTANT_PANEL_DEFAULT_WIDTH = 420;
export const AI_ASSISTANT_INPUT_IME_CONFIRM_SUPPRESSION_MS = 64;

export function buildAiAssistantModelOptions(
  providers: LlmProvider[]
): AiAssistantModelOption[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({
      value: `${provider.id}:${model}`,
      label: `${provider.name} - ${model}`,
      providerId: provider.id,
      modelName: model,
    }))
  );
}

export function getPreferredAiAssistantModelValue(providers: LlmProvider[]) {
  const preferredProvider =
    providers.find(
      (provider) => provider.isDefault && provider.enabled && provider.models.length > 0
    ) ??
    providers.find((provider) => provider.enabled && provider.models.length > 0) ??
    null;

  if (!preferredProvider) {
    return '';
  }

  const preferredModel =
    (preferredProvider.defaultModel &&
    preferredProvider.models.includes(preferredProvider.defaultModel)
      ? preferredProvider.defaultModel
      : preferredProvider.models[0]) ?? '';

  return preferredModel ? `${preferredProvider.id}:${preferredModel}` : '';
}

export function getValidAiAssistantModelValue(
  modelOptions: AiAssistantModelOption[],
  selectedModel: string
) {
  if (selectedModel && modelOptions.some((option) => option.value === selectedModel)) {
    return selectedModel;
  }

  return modelOptions[0]?.value ?? '';
}

export function getDefaultAiAssistantSessionId(
  sessions: LiveSession[],
  activeSessionId: string | null
) {
  if (activeSessionId && sessions.some((session) => session.id === activeSessionId)) {
    return activeSessionId;
  }

  return sessions[0]?.id ?? null;
}

export function getValidAiAssistantSessionId(
  sessions: LiveSession[],
  selectedSessionId: string | null,
  activeSessionId: string | null
) {
  if (selectedSessionId && sessions.some((session) => session.id === selectedSessionId)) {
    return selectedSessionId;
  }

  return getDefaultAiAssistantSessionId(sessions, activeSessionId);
}

export function clampAiAssistantPanelWidth(width: number) {
  return Math.min(
    AI_ASSISTANT_PANEL_MAX_WIDTH,
    Math.max(AI_ASSISTANT_PANEL_MIN_WIDTH, width)
  );
}

export function createAiAssistantInputImeState(): AiAssistantInputImeState {
  return {
    isComposing: false,
    suppressEnterUntil: 0,
  };
}

export function markAiAssistantInputCompositionStart(
  state: AiAssistantInputImeState
): AiAssistantInputImeState {
  return {
    ...state,
    isComposing: true,
    suppressEnterUntil: 0,
  };
}

export function markAiAssistantInputCompositionEnd(
  state: AiAssistantInputImeState,
  now: number
): AiAssistantInputImeState {
  return {
    ...state,
    isComposing: false,
    suppressEnterUntil: now + AI_ASSISTANT_INPUT_IME_CONFIRM_SUPPRESSION_MS,
  };
}

export function shouldSubmitAiAssistantOnEnter({
  event,
  imeState,
  now,
}: ShouldSubmitAiAssistantOnEnterInput) {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    event.isComposing !== true &&
    event.keyCode !== 229 &&
    !imeState.isComposing &&
    now >= imeState.suppressEnterUntil
  );
}

export function getAgentStepBudgetHint(maxSteps: number) {
  if (maxSteps >= 18) {
    return '当前为高预算模式，适合复杂排障，但会增加执行时长与 token 消耗。';
  }

  return '常规任务建议 12-15 步；复杂排障再提高预算。';
}

export function getAiAssistantThemeClasses(mode: AiAssistantThemeMode) {
  return {
    primaryTextClass: 'text-[var(--app-text-primary)]',
    secondaryTextClass: 'text-[var(--app-text-secondary)]',
    tertiaryTextClass: 'text-[var(--app-text-tertiary)]',
    infoTextClass: mode === 'light' ? 'text-blue-700' : 'text-blue-200',
    warningTextClass: mode === 'light' ? 'text-amber-900' : 'text-amber-200',
    errorTextClass: mode === 'light' ? 'text-red-700' : 'text-red-300',
  };
}

export function shouldAutoScrollAiAssistantTimeline(input: {
  open: boolean;
  previousOpen: boolean;
  mode: AiAssistantMode;
  previousMode: AiAssistantMode;
  visibleContentSignature: string;
  previousVisibleContentSignature: string;
  visibleItemCount: number;
  previousVisibleItemCount: number;
}) {
  if (!input.open) {
    return false;
  }

  if (!input.previousOpen) {
    return true;
  }

  if (input.mode !== input.previousMode) {
    return true;
  }

  if (input.visibleContentSignature !== input.previousVisibleContentSignature) {
    return true;
  }

  return input.visibleItemCount !== input.previousVisibleItemCount;
}

export function shouldEnableAiAssistantSend(input: {
  input: string;
  isBusy: boolean;
  mode: AiAssistantMode;
  selectedModel: string;
  selectedSessionId: string | null;
}) {
  if (!input.selectedModel || !input.input.trim() || input.isBusy) {
    return false;
  }

  return input.mode === 'chat' || input.selectedSessionId !== null;
}

export function shouldPresentAiAssistantInteractionDialog(
  interaction: InteractionRequest | null
) {
  return (
    interaction !== null &&
    interaction.status === 'open' &&
    interaction.interactionKind !== 'terminal_wait'
  );
}
