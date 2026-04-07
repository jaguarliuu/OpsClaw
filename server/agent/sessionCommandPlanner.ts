import type {
  EffectiveOpsClawRules,
  OpsClawIntentKind,
  ParameterSource,
  PlannerDecisionKind,
  ProtectedParameterName,
} from './controlledExecutionTypes.js';

type ExtractedProtectedParameter = {
  name: ProtectedParameterName;
  value: string;
};

type SessionCommandParameter = ExtractedProtectedParameter & {
  source: ParameterSource;
  confirmed: boolean;
};

export type SessionCommandPlan = {
  intent: {
    kind: OpsClawIntentKind;
  };
  parameters: SessionCommandParameter[];
  decision: {
    kind: PlannerDecisionKind;
  };
};

function classifySessionCommandIntent(command: string): OpsClawIntentKind {
  if (/\b(useradd|adduser|usermod|chpasswd|passwd)\b/i.test(command)) {
    return 'user_management';
  }
  if (/\b(systemctl|service)\s+(start|restart|stop)\b/i.test(command)) {
    return 'service.lifecycle_change';
  }
  if (/\b(rm|unlink)\b/i.test(command)) {
    return 'filesystem.delete';
  }
  return 'diagnostic.readonly';
}

function extractProtectedParameters(command: string): ExtractedProtectedParameter[] {
  const parameters: ExtractedProtectedParameter[] = [];

  const userAddMatch = command.match(
    /\b(?:useradd|adduser)\b(?:\s+-[^\s]+)*\s+([a-z_][a-z0-9_-]*)/i
  );
  if (userAddMatch) {
    parameters.push({ name: 'username', value: userAddMatch[1] });
  }

  const passwordMatch = command.match(
    /["']([^:"']+):([^"']+)["']\s*\|\s*sudo\s+chpasswd/i
  );
  if (passwordMatch) {
    parameters.push({ name: 'password', value: passwordMatch[2] });
  }

  if (/\bNOPASSWD\b/i.test(command)) {
    parameters.push({ name: 'sudo_policy', value: 'NOPASSWD' });
  }

  return parameters;
}

function detectParameterSource(userTask: string, parameterValue: string): ParameterSource {
  return userTask.includes(parameterValue) ? 'user_explicit' : 'agent_inferred';
}

function decidePlanKind(input: {
  hasProtectedInference: boolean;
  intentKind: OpsClawIntentKind;
  effectiveRules: EffectiveOpsClawRules;
}): PlannerDecisionKind {
  if (input.hasProtectedInference) {
    return 'require_parameter_confirmation';
  }

  const intentRule = input.effectiveRules.intents[input.intentKind];
  if (intentRule?.requireApproval) {
    return 'require_approval';
  }

  return 'allow_auto_execute';
}

export function buildSessionCommandPlan(input: {
  command: string;
  effectiveRules: EffectiveOpsClawRules;
  sessionGroupName: string | null;
  userTask: string;
  confirmedFields?: Partial<Record<ProtectedParameterName, string>>;
}): SessionCommandPlan {
  const intentKind = classifySessionCommandIntent(input.command);
  const intentRule = input.effectiveRules.intents[intentKind];
  const ruleProtectedNames = new Set(intentRule?.protectedParameters ?? []);
  const extracted = extractProtectedParameters(input.command).filter((parameter) =>
    ruleProtectedNames.has(parameter.name)
  );
  const parameters = extracted.map((parameter) => ({
    ...parameter,
    confirmed: input.confirmedFields?.[parameter.name] !== undefined,
    source:
      input.confirmedFields?.[parameter.name] !== undefined
        ? 'user_confirmed'
        : detectParameterSource(input.userTask, parameter.value),
  }));

  const hasProtectedInference = parameters.some(
    (parameter) => parameter.source === 'agent_inferred'
  );

  return {
    intent: { kind: intentKind },
    parameters,
    decision: {
      kind: decidePlanKind({
        hasProtectedInference,
        intentKind,
        effectiveRules: input.effectiveRules,
      }),
    },
  };
}
