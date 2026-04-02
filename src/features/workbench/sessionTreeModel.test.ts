import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSessionTreeView,
  clampContextMenuPosition,
  getProfileDotClass,
  getRelatedSession,
} from './sessionTreeModel.js';
import type { LiveSession, SavedConnectionGroup, SavedConnectionProfile } from './types.js';

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

void test('buildSessionTreeView returns original groups when query is blank', () => {
  const groups = [baseGroup];
  const result = buildSessionTreeView(groups, '', false, null);

  assert.equal(result.displayGroups, groups);
  assert.equal(result.isEmpty, false);
  assert.equal(result.isFilterEmpty, false);
});

void test('buildSessionTreeView filters profiles by name host or username', () => {
  const extraProfile: SavedConnectionProfile = {
    ...baseProfile,
    id: 'node-2',
    name: 'beta',
    host: 'db.internal',
    username: 'ubuntu',
  };
  const groups: SavedConnectionGroup[] = [
    {
      ...baseGroup,
      profiles: [baseProfile, extraProfile],
    },
  ];

  assert.deepEqual(buildSessionTreeView(groups, 'db', false, null).displayGroups[0]?.profiles, [
    extraProfile,
  ]);
  assert.deepEqual(
    buildSessionTreeView(groups, 'root', false, null).displayGroups[0]?.profiles,
    [baseProfile]
  );
});

void test('buildSessionTreeView exposes empty states correctly', () => {
  assert.equal(buildSessionTreeView([], '', false, null).isEmpty, true);
  assert.equal(buildSessionTreeView([baseGroup], 'missing', false, null).isFilterEmpty, true);
});

void test('getRelatedSession matches by host port and username', () => {
  const sessions: LiveSession[] = [
    {
      id: 'session-1',
      nodeId: 'node-1',
      label: 'alpha',
      host: '10.0.0.1',
      port: 22,
      username: 'root',
      authMode: 'password',
      status: 'connected',
    },
  ];

  assert.equal(getRelatedSession(sessions, baseProfile)?.id, 'session-1');
});

void test('getProfileDotClass prefers live session status over passive ping status', () => {
  assert.equal(
    getProfileDotClass(baseProfile, { status: 'connected' } as LiveSession, {}),
    'bg-emerald-500'
  );
  assert.equal(
    getProfileDotClass(baseProfile, { status: 'connecting' } as LiveSession, {}),
    'bg-amber-400'
  );
  assert.equal(getProfileDotClass(baseProfile, undefined, { 'node-1': true }), 'bg-emerald-500 opacity-40');
  assert.equal(getProfileDotClass(baseProfile, undefined, {}), 'bg-neutral-600');
});

void test('clampContextMenuPosition keeps the menu inside the viewport', () => {
  assert.deepEqual(
    clampContextMenuPosition(
      { x: 300, y: 200 },
      { width: 120, height: 80 },
      { width: 320, height: 220 }
    ),
    { x: 192, y: 132 }
  );
});
