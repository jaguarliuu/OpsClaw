import assert from 'node:assert/strict';
import test from 'node:test';

import {
  closeSshTerminalSearchState,
  toggleSshTerminalSearchOpenState,
  updateSshTerminalSearchQuery,
} from './sshTerminalSearchModel.js';

void test('toggleSshTerminalSearchOpenState flips the current open state', () => {
  assert.equal(toggleSshTerminalSearchOpenState(false), true);
  assert.equal(toggleSshTerminalSearchOpenState(true), false);
});

void test('closeSshTerminalSearchState closes search and clears the query', () => {
  assert.deepEqual(closeSshTerminalSearchState(), {
    isSearchOpen: false,
    searchQuery: '',
  });
});

void test('updateSshTerminalSearchQuery keeps the latest raw query value', () => {
  assert.equal(updateSshTerminalSearchQuery('  ssh root  '), '  ssh root  ');
});
