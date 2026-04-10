import { extractTemplateVariableNames } from './scriptLibraryModel.js';
import type { ScriptUsage, ScriptVariableDefinition } from './types.js';

export type ScriptSettingsScope = 'global' | 'node';
export type ScriptUsageFilter = ScriptUsage | 'all';

export function buildInitialScriptSettingsView(searchParams: URLSearchParams) {
  const scopeParam = searchParams.get('scope');
  const usageParam = searchParams.get('usage');
  const nodeIdParam = searchParams.get('nodeId')?.trim() ?? '';
  const scriptIdParam = searchParams.get('scriptId')?.trim() ?? '';

  const scope: ScriptSettingsScope = scopeParam === 'node' ? 'node' : 'global';
  const usageFilter: ScriptUsageFilter =
    usageParam === 'inspection' || usageParam === 'all' || usageParam === 'quick_run'
      ? usageParam
      : 'quick_run';

  return {
    scope,
    selectedNodeId: nodeIdParam,
    usageFilter,
    selectedScriptId: scriptIdParam || null,
  };
}

export function buildManagedScriptQuery(input: {
  scope: ScriptSettingsScope;
  selectedNodeId: string;
  usage: ScriptUsageFilter;
}) {
  const usage = input.usage === 'all' ? undefined : input.usage;

  if (input.scope === 'global') {
    return {
      scope: 'global' as const,
      nodeId: null,
      usage,
    };
  }

  const normalizedNodeId = input.selectedNodeId.trim();

  return {
    scope: 'node' as const,
    nodeId: normalizedNodeId === '' ? null : normalizedNodeId,
    usage,
  };
}

export function buildScriptSettingsIntro() {
  return '在终端里输入 x alias 可以快捷执行脚本；巡检脚本只在设置中单独维护，不会进入普通快捷执行候选。';
}

export function buildScriptUsageFilterOptions() {
  return [
    { value: 'quick_run' as const, label: '快捷执行' },
    { value: 'inspection' as const, label: '巡检脚本' },
    { value: 'all' as const, label: '全部' },
  ];
}

export function assertScriptUsageForEditor(value: unknown): ScriptUsage {
  if (value !== 'quick_run' && value !== 'inspection') {
    throw new Error('脚本用途缺失或无效，无法编辑。');
  }

  return value;
}

export function buildScriptUsageBadgeLabel(usage: ScriptUsage) {
  if (usage === 'inspection') {
    return '巡检脚本';
  }

  return null;
}

export function buildScriptSettingsEmptyState(input: {
  scope: ScriptSettingsScope;
  hasNodes: boolean;
  hasQuery: boolean;
  hasItems: boolean;
}) {
  if (input.hasItems) {
    return null;
  }

  if (input.scope === 'node' && !input.hasNodes) {
    return '暂无可选节点，请先创建节点后再维护节点脚本。';
  }

  if (input.hasQuery) {
    return '没有匹配当前搜索条件的脚本。';
  }

  return '当前范围下还没有脚本。';
}

export function normalizeTemplateVariableDefinitions(
  variables: ScriptVariableDefinition[]
) {
  return variables.map((variable) => ({
    ...variable,
    name: variable.name.trim(),
  }));
}

export function validateTemplateScriptDefinition(
  content: string,
  variables: ScriptVariableDefinition[]
) {
  const placeholderNames = extractTemplateVariableNames(content);
  const normalizedVariableNames = normalizeTemplateVariableDefinitions(variables).map(
    (variable) => variable.name
  );

  if (normalizedVariableNames.some((name) => name === '')) {
    return {
      ok: false as const,
      message: '模板变量名不能为空。',
    };
  }

  const seenNames = new Set<string>();
  for (const name of normalizedVariableNames) {
    if (seenNames.has(name)) {
      return {
        ok: false as const,
        message: `模板变量名不能重复：${name}。`,
      };
    }
    seenNames.add(name);
  }

  const missingDefinitionName = placeholderNames.find((name) => !seenNames.has(name));
  if (missingDefinitionName) {
    return {
      ok: false as const,
      message: `模板占位符缺少变量定义：${missingDefinitionName}。`,
    };
  }

  return {
    ok: true as const,
    message: null,
  };
}
