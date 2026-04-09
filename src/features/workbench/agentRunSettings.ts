export const AGENT_MAX_STEPS_STORAGE_KEY = 'opsclaw.agent.maxSteps';
export const AGENT_MAX_STEP_OPTIONS = [12, 18, 24, 30, 40] as const;
export const DEFAULT_AGENT_MAX_STEPS = 24;

type AgentSettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function normalizeAgentMaxSteps(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return DEFAULT_AGENT_MAX_STEPS;
  }

  return AGENT_MAX_STEP_OPTIONS.includes(value as (typeof AGENT_MAX_STEP_OPTIONS)[number])
    ? value
    : DEFAULT_AGENT_MAX_STEPS;
}

export function loadAgentMaxSteps(
  storage: AgentSettingsStorage | undefined = globalThis.localStorage
) {
  try {
    const raw = storage?.getItem(AGENT_MAX_STEPS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_AGENT_MAX_STEPS;
    }

    return normalizeAgentMaxSteps(Number.parseInt(raw, 10));
  } catch {
    return DEFAULT_AGENT_MAX_STEPS;
  }
}

export function saveAgentMaxSteps(
  value: number,
  storage: AgentSettingsStorage | undefined = globalThis.localStorage
) {
  const normalizedValue = normalizeAgentMaxSteps(value);
  storage?.setItem(AGENT_MAX_STEPS_STORAGE_KEY, String(normalizedValue));
}
