import { useState } from 'react';

import {
  buildSessionTreeFilterState,
  clearSessionTreeFilterQuery,
  updateSessionTreeFilterQuery,
} from '@/features/workbench/sessionTreeFilterModel';
import type { SavedConnectionGroup } from '@/features/workbench/types';

type UseSessionTreeFilterOptions = {
  errorMessage: string | null;
  groups: SavedConnectionGroup[];
  isLoading: boolean;
};

export function useSessionTreeFilter({
  errorMessage,
  groups,
  isLoading,
}: UseSessionTreeFilterOptions) {
  const [filterQuery, setFilterQuery] = useState('');
  const filterState = buildSessionTreeFilterState(
    groups,
    filterQuery,
    isLoading,
    errorMessage
  );

  const handleFilterQueryChange = (nextFilterQuery: string) => {
    setFilterQuery(updateSessionTreeFilterQuery(nextFilterQuery));
  };

  const clearFilterQuery = () => {
    setFilterQuery(clearSessionTreeFilterQuery());
  };

  return {
    ...filterState,
    clearFilterQuery,
    handleFilterQueryChange,
  };
}
