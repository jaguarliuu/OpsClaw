export type OpsClawIntentKind =
  | 'diagnostic.readonly'
  | 'routine.safe_change'
  | 'service.lifecycle_change'
  | 'filesystem.write'
  | 'filesystem.delete'
  | 'package_management'
  | 'user_management'
  | 'permission_change'
  | 'credential_change';

export type ProtectedParameterName =
  | 'username'
  | 'password'
  | 'sudo_policy'
  | 'target_path'
  | 'target_service'
  | 'write_content'
  | 'delete_scope'
  | 'package_name';

export type ParameterSource =
  | 'user_explicit'
  | 'user_confirmed'
  | 'system_observed'
  | 'agent_inferred';

export type PlannerDecisionKind =
  | 'allow_auto_execute'
  | 'require_parameter_confirmation'
  | 'require_approval'
  | 'deny';

export type OpsClawRiskLevel = 'low' | 'medium' | 'high';

export type OpsClawIntentRule = {
  defaultRisk: OpsClawRiskLevel;
  requireApproval: boolean;
  protectedParameters: ProtectedParameterName[];
};

export type OpsClawIntentRuleOverride = Partial<OpsClawIntentRule>;

export type OpsClawRulesFile = {
  version: 1;
  global: {
    intents: Partial<Record<OpsClawIntentKind, OpsClawIntentRule>>;
  };
  groups: Record<
    string,
    {
      intents: Partial<Record<OpsClawIntentKind, OpsClawIntentRuleOverride>>;
    }
  >;
};

export type EffectiveOpsClawRules = {
  intents: Partial<Record<OpsClawIntentKind, OpsClawIntentRule>>;
};
