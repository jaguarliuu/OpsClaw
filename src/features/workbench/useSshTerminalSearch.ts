import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { SearchAddon } from '@xterm/addon-search';
import type { Terminal } from '@xterm/xterm';

import {
  closeSshTerminalSearchState,
  toggleSshTerminalSearchOpenState,
  updateSshTerminalSearchQuery,
} from '@/features/workbench/sshTerminalSearchModel';

type UseSshTerminalSearchOptions = {
  searchAddonRef: MutableRefObject<SearchAddon | null>;
  terminalRef: MutableRefObject<Terminal | null>;
};

export function useSshTerminalSearch({
  searchAddonRef,
  terminalRef,
}: UseSshTerminalSearchOptions) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleSearchQueryChange = useCallback((nextQuery: string) => {
    setSearchQuery(updateSshTerminalSearchQuery(nextQuery));
  }, []);

  const findNext = useCallback(() => {
    searchAddonRef.current?.findNext(searchQuery, { caseSensitive: false, incremental: false });
  }, [searchAddonRef, searchQuery]);

  const findPrev = useCallback(() => {
    searchAddonRef.current?.findPrevious(searchQuery, { caseSensitive: false, incremental: false });
  }, [searchAddonRef, searchQuery]);

  const closeSearch = useCallback(() => {
    const nextState = closeSshTerminalSearchState();
    setIsSearchOpen(nextState.isSearchOpen);
    setSearchQuery(nextState.searchQuery);
    searchAddonRef.current?.findNext('');
    terminalRef.current?.focus();
  }, [searchAddonRef, terminalRef]);

  const toggleSearch = useCallback(() => {
    setIsSearchOpen((current) => toggleSshTerminalSearchOpenState(current));
  }, []);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (!searchQuery) {
      searchAddonRef.current?.findNext('');
      return;
    }

    searchAddonRef.current?.findNext(searchQuery, {
      caseSensitive: false,
      incremental: true,
    });
  }, [searchAddonRef, searchQuery]);

  return {
    closeSearch,
    findNext,
    findPrev,
    handleSearchQueryChange,
    isSearchOpen,
    searchInputRef,
    searchQuery,
    toggleSearch,
  };
}
