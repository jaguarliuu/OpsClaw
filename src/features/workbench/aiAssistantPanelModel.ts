import type { LiveSession, LlmProvider } from './types';

export type AiAssistantMode = 'agent' | 'chat';

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

export function getDefaultAiAssistantSessionId(
  sessions: LiveSession[],
  activeSessionId: string | null
) {
  if (activeSessionId && sessions.some((session) => session.id === activeSessionId)) {
    return activeSessionId;
  }

  return sessions[0]?.id ?? null;
}

export function clampAiAssistantPanelWidth(width: number) {
  return Math.min(
    AI_ASSISTANT_PANEL_MAX_WIDTH,
    Math.max(AI_ASSISTANT_PANEL_MIN_WIDTH, width)
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
