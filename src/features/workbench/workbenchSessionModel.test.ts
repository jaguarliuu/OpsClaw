import assert from 'node:assert/strict';
import test from 'node:test';

import type { LiveSession, SavedConnectionProfile } from './types.js';
import {
  activateProfileSession,
  closeSessionState,
  openSessionState,
  removeNodeSessions,
  selectAdjacentSessionId,
  selectSessionIdAtIndex,
  updateSessionStatus,
} from './workbenchSessionModel.js';

const sampleProfile: SavedConnectionProfile = {
  id: 'node-1',
  name: 'prod-api',
  groupId: 'group-1',
  group: '生产',
  jumpHostId: null,
  host: '10.0.0.8',
  port: 22,
  username: 'ubuntu',
  authMode: 'password',
  note: '密码连接',
};

const activeSession: LiveSession = {
  id: 'session-1',
  nodeId: 'node-1',
  label: 'prod-api',
  host: '10.0.0.8',
  port: 22,
  username: 'ubuntu',
  authMode: 'password',
  status: 'connected',
};

void test('activateProfileSession reuses existing non-closed matching session', () => {
  const sessions = [activeSession];

  const result = activateProfileSession(sessions, sampleProfile, () => {
    throw new Error('should not create session');
  });

  assert.equal(result.activeSessionId, 'session-1');
  assert.equal(result.sessions, sessions);
});

void test('activateProfileSession creates a new session when only closed matches exist', () => {
  const closedSession: LiveSession = {
    ...activeSession,
    id: 'session-closed',
    status: 'closed',
  };

  const result = activateProfileSession([closedSession], sampleProfile, () => ({
    ...activeSession,
    id: 'session-2',
    status: 'connecting',
  }));

  assert.equal(result.activeSessionId, 'session-2');
  assert.equal(result.sessions.length, 2);
  assert.equal(result.sessions[1]?.id, 'session-2');
});

void test('openSessionState reuses an existing session and closes the connection panel', () => {
  const result = openSessionState([activeSession], sampleProfile, () => {
    throw new Error('should not create session');
  });

  assert.equal(result.activeSessionId, 'session-1');
  assert.equal(result.isConnectionPanelOpen, false);
  assert.equal(result.isSidebarCollapsed, true);
});

void test('openSessionState creates a session and returns the next session list', () => {
  const result = openSessionState([], sampleProfile, () => ({
    ...activeSession,
    id: 'session-2',
    status: 'connecting',
  }));

  assert.equal(result.activeSessionId, 'session-2');
  assert.equal(result.sessions.length, 1);
  assert.equal(result.isConnectionPanelOpen, false);
  assert.equal(result.isSidebarCollapsed, true);
});

void test('removeNodeSessions drops deleted node sessions and reselects active tab', () => {
  const otherSession: LiveSession = {
    ...activeSession,
    id: 'session-2',
    nodeId: 'node-2',
    host: '10.0.0.9',
  };

  const result = removeNodeSessions([activeSession, otherSession], 'node-1', 'session-1');

  assert.deepEqual(result.sessions, [otherSession]);
  assert.equal(result.activeSessionId, 'session-2');
});

void test('closeSessionState keeps active tab when another session is closed', () => {
  const otherSession: LiveSession = {
    ...activeSession,
    id: 'session-2',
    nodeId: 'node-2',
    host: '10.0.0.9',
  };

  const result = closeSessionState([activeSession, otherSession], 'session-2', 'session-1');

  assert.deepEqual(result.sessions, [activeSession]);
  assert.equal(result.activeSessionId, 'session-1');
});

void test('updateSessionStatus is a no-op when status and error are unchanged', () => {
  const sessions = [activeSession];
  const result = updateSessionStatus(sessions, 'session-1', 'connected');

  assert.equal(result, sessions);
});

void test('selectSessionIdAtIndex returns the session id at the requested index', () => {
  const otherSession: LiveSession = {
    ...activeSession,
    id: 'session-2',
  };

  assert.equal(selectSessionIdAtIndex([activeSession, otherSession], 1), 'session-2');
  assert.equal(selectSessionIdAtIndex([activeSession], 3), null);
});

void test('selectAdjacentSessionId wraps around the session list', () => {
  const otherSession: LiveSession = {
    ...activeSession,
    id: 'session-2',
  };

  assert.equal(
    selectAdjacentSessionId([activeSession, otherSession], 'session-1', -1),
    'session-2'
  );
  assert.equal(
    selectAdjacentSessionId([activeSession, otherSession], 'session-2', 1),
    'session-1'
  );
  assert.equal(selectAdjacentSessionId([], 'session-1', 1), null);
});
