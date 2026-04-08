import type { ScriptLibraryItem, ScriptVariableDefinition } from './types.js';

const TEMPLATE_VARIABLE_PATTERN = /\$\{([a-zA-Z0-9_]+)\}/g;
export const SCRIPT_ALIAS_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function extractTemplateVariableNames(content: string) {
  const names = new Set<string>();

  for (const match of content.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    const name = match[1];
    if (name) {
      names.add(name);
    }
  }

  return Array.from(names);
}

export function renderScriptTemplate(content: string, values: Record<string, string>) {
  return content.replaceAll(TEMPLATE_VARIABLE_PATTERN, (_match, name: string) => values[name] ?? '');
}

export function validateScriptVariableValues(
  variables: ScriptVariableDefinition[],
  values: Record<string, string>
) {
  for (const variable of variables) {
    const value = values[variable.name] ?? variable.defaultValue ?? '';
    if (variable.required && !value.trim()) {
      return {
        ok: false as const,
        message: `${variable.label}不能为空。`,
      };
    }
  }

  return {
    ok: true as const,
    message: null,
  };
}

export function validateScriptAlias(alias: string) {
  const normalized = alias.trim();
  if (!normalized) {
    return { ok: false as const, message: '脚本别名不能为空。' };
  }
  if (!SCRIPT_ALIAS_PATTERN.test(normalized)) {
    return { ok: false as const, message: '脚本别名只能包含小写字母、数字、-、_。' };
  }
  return { ok: true as const, message: null };
}

export function filterScriptLibraryItems(items: ScriptLibraryItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const haystacks = [item.alias, item.title, item.key, item.description, ...item.tags];
    return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

export function buildScriptVariableInitialValues(variables: ScriptVariableDefinition[]) {
  return Object.fromEntries(
    variables.map((variable) => [variable.name, variable.defaultValue])
  ) as Record<string, string>;
}
