export function toggleSshTerminalSearchOpenState(current: boolean) {
  return !current;
}

export function closeSshTerminalSearchState() {
  return {
    isSearchOpen: false,
    searchQuery: '',
  };
}

export function updateSshTerminalSearchQuery(nextQuery: string) {
  return nextQuery;
}
