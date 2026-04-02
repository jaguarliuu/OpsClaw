import assert from 'node:assert/strict';
import test from 'node:test';

import type { SavedConnectionGroup, SavedConnectionProfile } from './types.js';
import {
  buildSessionTreeFilterState,
  clearSessionTreeFilterQuery,
  updateSessionTreeFilterQuery,
} from './sessionTreeFilterModel.js';

const baseProfile: SavedConnectionProfile = {
  id: 'node-1',
  name: 'alpha',
  host: '10.0.0.1',
  port: 22,
  username: 'root',
  authMode: 'password',
  groupId: 'group-1',
  group: 'Default',
  jumpHostId: null,
  note: '',
};

const baseGroup: SavedConnectionGroup = {
  id: 'group-1',
  name: 'Default',
  isDefault: true,
  profiles: [baseProfile],
};

void test('updateSessionTreeFilterQuery keeps the latest raw input value', () => {
  assert.equal(updateSessionTreeFilterQuery(' node-1 '), ' node-1 ');
});

void test('clearSessionTreeFilterQuery resets the query to empty', () => {
  assert.equal(clearSessionTreeFilterQuery(), '');
});

void test('buildSessionTreeFilterState combines search chrome state with filtered group state', () => {
  assert.deepEqual(buildSessionTreeFilterState([baseGroup], '', false, null), {
    displayGroups: [baseGroup],
    filterQuery: '',
    isEmpty: false,
    isFilterEmpty: false,
    showClearButton: false,
  });

  assert.deepEqual(buildSessionTreeFilterState([baseGroup], 'missing', false, null), {
    displayGroups: [],
    filterQuery: 'missing',
    isEmpty: false,
    isFilterEmpty: true,
    showClearButton: true,
  });
});
