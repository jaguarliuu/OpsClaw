import { extractTemplateVariableNames } from './scriptLibraryModel.js';
import type { ScriptVariableDefinition } from './types.js';

export type ScriptSettingsScope = 'global' | 'node';

export function buildManagedScriptQuery(input: {
  scope: ScriptSettingsScope;
  selectedNodeId: string;
}) {
  if (input.scope === 'global') {
    return {
      scope: 'global' as const,
      nodeId: null,
    };
  }

  const normalizedNodeId = input.selectedNodeId.trim();

  return {
    scope: 'node' as const,
    nodeId: normalizedNodeId === '' ? null : normalizedNodeId,
  };
}

export function buildScriptSettingsIntro() {
  return '在终端里输入 x alias 可以快捷执行脚本。';
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
