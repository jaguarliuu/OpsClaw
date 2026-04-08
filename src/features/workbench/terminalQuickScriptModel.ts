import type { ScriptLibraryItem } from './types.js';

export const TERMINAL_QUICK_SCRIPT_PREFIX = 'x ';
export const TERMINAL_QUICK_SCRIPT_DELAY_MS = 300;

export function detectTerminalQuickScriptQuery(input: string) {
  if (!input.startsWith(TERMINAL_QUICK_SCRIPT_PREFIX)) {
    return null;
  }

  return input.slice(TERMINAL_QUICK_SCRIPT_PREFIX.length);
}

export function rankQuickScriptCandidates(items: readonly ScriptLibraryItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  const ranked = items.filter((item) => {
    if (!normalized) {
      return true;
    }
    return [item.alias, item.title, ...item.tags].some((value) =>
      value.toLowerCase().includes(normalized)
    );
  });

  return ranked.sort((left, right) => {
    const leftAliasExact = left.alias.toLowerCase() === normalized ? 0 : 1;
    const rightAliasExact = right.alias.toLowerCase() === normalized ? 0 : 1;
    if (leftAliasExact !== rightAliasExact) {
      return leftAliasExact - rightAliasExact;
    }
    if (left.resolvedFrom !== right.resolvedFrom) {
      return left.resolvedFrom === 'node' ? -1 : 1;
    }
    return left.alias.localeCompare(right.alias);
  });
}

export function findExactQuickScriptMatch(items: readonly ScriptLibraryItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  return rankQuickScriptCandidates(items, normalized).find(
    (item) => item.alias.toLowerCase() === normalized
  ) ?? null;
}
