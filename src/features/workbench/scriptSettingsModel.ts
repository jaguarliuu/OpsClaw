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

  return {
    scope: 'node' as const,
    nodeId: input.selectedNodeId || null,
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
