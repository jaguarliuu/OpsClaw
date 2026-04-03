export const SESSION_TREE_GRID_ROWS_CLASS = 'grid-rows-[auto_auto_1fr_auto]';
export const SESSION_TREE_TITLE = 'OpsClaw';

export function buildSessionTreeFooterActions() {
  return [
    { id: 'new-connection', label: '新建连接' },
    { id: 'collapse-sidebar', label: '收起侧栏' },
    { id: 'open-settings', label: '设置' },
  ] as const;
}

export function shouldShowFilterClearButton(filterQuery: string) {
  return filterQuery !== '';
}

export function buildSessionTreeSearchState(filterQuery: string) {
  return {
    showClearButton: shouldShowFilterClearButton(filterQuery),
  };
}
