import { buildSessionTreeSearchState } from './sessionTreeChromeModel';
import { buildSessionTreeView } from './sessionTreeModel';
import type { SavedConnectionGroup } from './types';

export function updateSessionTreeFilterQuery(nextFilterQuery: string) {
  return nextFilterQuery;
}

export function clearSessionTreeFilterQuery() {
  return '';
}

export function buildSessionTreeFilterState(
  groups: SavedConnectionGroup[],
  filterQuery: string,
  isLoading: boolean,
  errorMessage: string | null
) {
  const { displayGroups, isEmpty, isFilterEmpty } = buildSessionTreeView(
    groups,
    filterQuery,
    isLoading,
    errorMessage
  );
  const { showClearButton } = buildSessionTreeSearchState(filterQuery);

  return {
    displayGroups,
    filterQuery,
    isEmpty,
    isFilterEmpty,
    showClearButton,
  };
}
