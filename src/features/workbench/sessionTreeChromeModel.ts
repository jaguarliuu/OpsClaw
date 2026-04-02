export const SESSION_TREE_GRID_ROWS_CLASS = 'grid-rows-[auto_auto_1fr_auto]';

export function shouldShowFilterClearButton(filterQuery: string) {
  return filterQuery !== '';
}

export function buildSessionTreeSearchState(filterQuery: string) {
  return {
    showClearButton: shouldShowFilterClearButton(filterQuery),
  };
}
