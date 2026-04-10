import type { ScriptLibraryItem } from './types.js';

export const TERMINAL_QUICK_SCRIPT_PREFIX = 'x ';
export const TERMINAL_QUICK_SCRIPT_DELAY_MS = 300;

export type TerminalQuickScriptSuggestionItem = {
  id: string;
  label: string;
  detail: string;
  highlighted: boolean;
};

export type TerminalQuickScriptBuiltinAction = 'dashboard';

export type TerminalQuickScriptCandidate =
  | {
      kind: 'script';
      id: string;
      label: string;
      detail: string;
      script: ScriptLibraryItem;
    }
  | {
      kind: 'builtin';
      id: string;
      label: string;
      detail: string;
      builtinAction: TerminalQuickScriptBuiltinAction;
    };

export function resolveTerminalDashboardShortcut(input: string) {
  return input.trim().toLowerCase() === 'x dashboard';
}

export function detectTerminalQuickScriptQuery(input: string) {
  if (resolveTerminalDashboardShortcut(input)) {
    return null;
  }

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

export function buildQuickScriptCandidates(
  items: readonly ScriptLibraryItem[],
  query: string
): TerminalQuickScriptCandidate[] {
  const rankedScripts = rankQuickScriptCandidates(items, query).map((item) => ({
    kind: 'script' as const,
    id: item.id,
    label: item.alias,
    detail: `${item.title} · ${item.resolvedFrom} · ${item.kind}`,
    script: item,
  }));

  const normalized = query.trim().toLowerCase();
  const matchesDashboard = normalized.length === 0 || 'dashboard'.includes(normalized);
  const builtinCandidates: TerminalQuickScriptCandidate[] = matchesDashboard
    ? [
        {
          kind: 'builtin',
          id: 'builtin-dashboard',
          label: 'dashboard',
          detail: '节点状态面板 · 内置',
          builtinAction: 'dashboard',
        },
      ]
    : [];

  return [...builtinCandidates, ...rankedScripts].sort((left, right) => {
    const leftAliasExact = left.label.toLowerCase() === normalized ? 0 : 1;
    const rightAliasExact = right.label.toLowerCase() === normalized ? 0 : 1;
    if (leftAliasExact !== rightAliasExact) {
      return leftAliasExact - rightAliasExact;
    }
    if (left.kind !== right.kind) {
      return left.kind === 'builtin' ? -1 : 1;
    }
    if (left.kind === 'script' && right.kind === 'script') {
      if (left.script.resolvedFrom !== right.script.resolvedFrom) {
        return left.script.resolvedFrom === 'node' ? -1 : 1;
      }
    }
    return left.label.localeCompare(right.label);
  });
}

export function findExactQuickScriptMatch(items: readonly ScriptLibraryItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  return rankQuickScriptCandidates(items, normalized).find(
    (item) => item.alias.toLowerCase() === normalized
  ) ?? null;
}

export function buildQuickScriptSuggestionItems(
  items: readonly TerminalQuickScriptCandidate[],
  selectedIndex: number
): TerminalQuickScriptSuggestionItem[] {
  return items.map((item, index) => ({
    id: item.id,
    label: item.label,
    detail: item.detail,
    highlighted: index === selectedIndex,
  }));
}

export function isQuickScriptQueryStillCurrent(inputBuffer: string, expectedQuery: string) {
  const currentQuery = detectTerminalQuickScriptQuery(inputBuffer);
  return currentQuery !== null && currentQuery === expectedQuery;
}

export function resolveQuickScriptExecutionTarget(input: {
  query: string;
  items: readonly ScriptLibraryItem[];
  rankedQuery: string | null;
  rankedItems: readonly TerminalQuickScriptCandidate[];
  selectedIndex: number;
}) {
  const normalizedQuery = input.query.trim().toLowerCase();
  const normalizedRankedQuery = input.rankedQuery?.trim().toLowerCase() ?? null;
  const rankedMatchesCurrent = normalizedQuery === normalizedRankedQuery;
  const rankedCandidates = rankedMatchesCurrent
    ? input.rankedItems
    : buildQuickScriptCandidates(input.items, input.query);

  const selectedIndex = rankedMatchesCurrent ? input.selectedIndex : 0;
  const selectedMatch = rankedCandidates[selectedIndex] ?? null;
  const exactMatch = findExactQuickScriptMatch(input.items, input.query);
  if (selectedMatch) {
    return selectedMatch;
  }
  if (exactMatch) {
    return {
      kind: 'script' as const,
      id: exactMatch.id,
      label: exactMatch.alias,
      detail: `${exactMatch.title} · ${exactMatch.resolvedFrom} · ${exactMatch.kind}`,
      script: exactMatch,
    };
  }
  return null;
}

export function buildQuickScriptCompletion(input: {
  inputBuffer: string;
  items: readonly ScriptLibraryItem[];
  rankedQuery: string | null;
  rankedItems: readonly TerminalQuickScriptCandidate[];
  selectedIndex: number;
}) {
  const query = detectTerminalQuickScriptQuery(input.inputBuffer);
  if (query === null) {
    return null;
  }

  const target = resolveQuickScriptExecutionTarget({
    query,
    items: input.items,
    rankedQuery: input.rankedQuery,
    rankedItems: input.rankedItems,
    selectedIndex: input.selectedIndex,
  });
  if (!target) {
    return null;
  }

  const completedInput = `${TERMINAL_QUICK_SCRIPT_PREFIX}${target.label}`;
  const forwardedInput = completedInput.slice(input.inputBuffer.length);
  if (!forwardedInput) {
    return null;
  }

  return {
    completedInput,
    forwardedInput,
  };
}
