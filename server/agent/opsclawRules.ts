import { access, readFile } from 'node:fs/promises';
import YAML from 'yaml';

import type {
  EffectiveOpsClawRules,
  OpsClawIntentRule,
  OpsClawIntentRuleOverride,
  OpsClawIntentKind,
  OpsClawRiskLevel,
  OpsClawRulesFile,
  ProtectedParameterName,
} from './controlledExecutionTypes.js';

const VALID_INTENTS = new Set<OpsClawIntentKind>([
  'diagnostic.readonly',
  'routine.safe_change',
  'service.lifecycle_change',
  'filesystem.write',
  'filesystem.delete',
  'package_management',
  'user_management',
  'permission_change',
  'credential_change',
]);

const VALID_RISK_LEVELS = new Set<OpsClawRiskLevel>(['low', 'medium', 'high']);

const VALID_PROTECTED_PARAMETERS = new Set<ProtectedParameterName>([
  'username',
  'password',
  'sudo_policy',
  'target_path',
  'target_service',
  'write_content',
  'delete_scope',
  'package_name',
]);

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `Invalid OpsClaw rules YAML: ${path} must be an object`
    );
  }
}

function assertOnlyAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new Error(
        `Invalid OpsClaw rules YAML: ${path} contains unsupported key "${key}"`
      );
    }
  }
}

function parseProtectedParameters(
  value: unknown,
  path: string
): ProtectedParameterName[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid OpsClaw rules YAML: ${path} must be an array`
    );
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || !VALID_PROTECTED_PARAMETERS.has(entry as ProtectedParameterName)) {
      throw new Error(
        `Invalid OpsClaw rules YAML: ${path}[${index}] must be a valid protected parameter`
      );
    }
    return entry as ProtectedParameterName;
  });
}

function parseIntentRule(value: unknown, path: string): OpsClawIntentRule {
  assertRecord(value, path);
  assertOnlyAllowedKeys(
    value,
    ['defaultRisk', 'requireApproval', 'protectedParameters'],
    path
  );

  const { defaultRisk, requireApproval, protectedParameters } = value;
  if (typeof defaultRisk !== 'string' || !VALID_RISK_LEVELS.has(defaultRisk as OpsClawRiskLevel)) {
    throw new Error(
      `Invalid OpsClaw rules YAML: ${path}.defaultRisk must be one of low|medium|high`
    );
  }
  if (typeof requireApproval !== 'boolean') {
    throw new Error(
      `Invalid OpsClaw rules YAML: ${path}.requireApproval must be a boolean`
    );
  }

  return {
    defaultRisk: defaultRisk as OpsClawRiskLevel,
    requireApproval,
    protectedParameters: parseProtectedParameters(
      protectedParameters,
      `${path}.protectedParameters`
    ),
  };
}

function parseIntentRuleOverride(
  value: unknown,
  path: string
): OpsClawIntentRuleOverride {
  assertRecord(value, path);
  assertOnlyAllowedKeys(
    value,
    ['defaultRisk', 'requireApproval', 'protectedParameters'],
    path
  );

  const parsed: OpsClawIntentRuleOverride = {};
  if ('defaultRisk' in value) {
    const defaultRisk = value.defaultRisk;
    if (
      typeof defaultRisk !== 'string' ||
      !VALID_RISK_LEVELS.has(defaultRisk as OpsClawRiskLevel)
    ) {
      throw new Error(
        `Invalid OpsClaw rules YAML: ${path}.defaultRisk must be one of low|medium|high`
      );
    }
    parsed.defaultRisk = defaultRisk as OpsClawRiskLevel;
  }
  if ('requireApproval' in value) {
    const requireApproval = value.requireApproval;
    if (typeof requireApproval !== 'boolean') {
      throw new Error(
        `Invalid OpsClaw rules YAML: ${path}.requireApproval must be a boolean`
      );
    }
    parsed.requireApproval = requireApproval;
  }
  if ('protectedParameters' in value) {
    parsed.protectedParameters = parseProtectedParameters(
      value.protectedParameters,
      `${path}.protectedParameters`
    );
  }

  return parsed;
}

function parseOpsClawRules(rawParsed: unknown): OpsClawRulesFile {
  assertRecord(rawParsed, 'root');
  assertOnlyAllowedKeys(rawParsed, ['version', 'global', 'groups'], 'root');

  if (rawParsed.version !== 1) {
    throw new Error('Invalid OpsClaw rules YAML: version must be 1');
  }

  assertRecord(rawParsed.global, 'global');
  assertOnlyAllowedKeys(rawParsed.global, ['intents'], 'global');
  assertRecord(rawParsed.global.intents, 'global.intents');

  const globalIntents: Partial<Record<OpsClawIntentKind, OpsClawIntentRule>> = {};
  for (const [intentKey, ruleValue] of Object.entries(rawParsed.global.intents)) {
    if (!VALID_INTENTS.has(intentKey as OpsClawIntentKind)) {
      throw new Error(
        `Invalid OpsClaw rules YAML: global.intents contains unknown intent "${intentKey}"`
      );
    }
    globalIntents[intentKey as OpsClawIntentKind] = parseIntentRule(
      ruleValue,
      `global.intents.${intentKey}`
    );
  }

  assertRecord(rawParsed.groups, 'groups');
  const groups: OpsClawRulesFile['groups'] = {};
  for (const [groupName, groupValue] of Object.entries(rawParsed.groups)) {
    assertRecord(groupValue, `groups.${groupName}`);
    assertOnlyAllowedKeys(groupValue, ['intents'], `groups.${groupName}`);
    assertRecord(groupValue.intents, `groups.${groupName}.intents`);

    const intents: Partial<Record<OpsClawIntentKind, OpsClawIntentRuleOverride>> = {};
    for (const [intentKey, overrideValue] of Object.entries(groupValue.intents)) {
      if (!VALID_INTENTS.has(intentKey as OpsClawIntentKind)) {
        throw new Error(
          `Invalid OpsClaw rules YAML: groups.${groupName}.intents contains unknown intent "${intentKey}"`
        );
      }
      if (globalIntents[intentKey as OpsClawIntentKind] === undefined) {
        throw new Error(
          `Invalid OpsClaw rules YAML: groups.${groupName}.intents contains unknown intent "${intentKey}" for this policy (missing global base rule)`
        );
      }
      intents[intentKey as OpsClawIntentKind] = parseIntentRuleOverride(
        overrideValue,
        `groups.${groupName}.intents.${intentKey}`
      );
    }

    groups[groupName] = { intents };
  }

  return {
    version: 1,
    global: {
      intents: globalIntents,
    },
    groups,
  };
}

export async function loadOpsClawRules(rulesUrl: URL): Promise<OpsClawRulesFile> {
  const raw = await readFile(rulesUrl, 'utf8');
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid OpsClaw rules YAML: parse error: ${message}`);
  }
  return parseOpsClawRules(parsed);
}

const BUNDLED_RULES_CANDIDATE_PATHS = [
  '../../opsclaw.rules.yaml',
  '../../../opsclaw.rules.yaml',
] as const;

export async function loadBundledOpsClawRules(moduleUrl: string | URL) {
  const baseUrl = typeof moduleUrl === 'string' ? new URL(moduleUrl) : moduleUrl;
  const candidateUrls = BUNDLED_RULES_CANDIDATE_PATHS.map(
    (relativePath) => new URL(relativePath, baseUrl)
  );

  for (const candidateUrl of candidateUrls) {
    try {
      await access(candidateUrl);
      return await loadOpsClawRules(candidateUrl);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `OpsClaw rules file not found. Checked: ${candidateUrls.map((item) => item.href).join(', ')}`
  );
}

export function resolveEffectiveOpsClawRules(
  rules: OpsClawRulesFile,
  groupName: string | null
): EffectiveOpsClawRules {
  const groupOverride = groupName ? rules.groups[groupName] ?? null : null;

  return {
    intents: {
      ...rules.global.intents,
      ...Object.fromEntries(
        Object.entries(groupOverride?.intents ?? {}).map(([key, override]) => [
          key,
          {
            ...rules.global.intents[key as OpsClawIntentKind],
            ...override,
          },
        ])
      ),
    },
  };
}
