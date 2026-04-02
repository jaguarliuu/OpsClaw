import type {
  ConnectionStatus,
  LiveSession,
  SavedConnectionProfile,
} from './types';

export function findReusableSession(
  sessions: LiveSession[],
  profile: SavedConnectionProfile
) {
  return sessions.find(
    (session) =>
      session.host === profile.host &&
      session.port === profile.port &&
      session.username === profile.username &&
      session.status !== 'closed'
  );
}

export function activateProfileSession(
  sessions: LiveSession[],
  profile: SavedConnectionProfile,
  createSession: (profile: SavedConnectionProfile) => LiveSession
) {
  const existingSession = findReusableSession(sessions, profile);
  if (existingSession) {
    return {
      activeSessionId: existingSession.id,
      sessions,
    };
  }

  const nextSession = createSession(profile);
  return {
    activeSessionId: nextSession.id,
    sessions: [...sessions, nextSession],
  };
}

export function openSessionState(
  sessions: LiveSession[],
  profile: SavedConnectionProfile,
  createSession: (profile: SavedConnectionProfile) => LiveSession
) {
  const nextState = activateProfileSession(sessions, profile, createSession);

  return {
    ...nextState,
    isConnectionPanelOpen: false,
    isSidebarCollapsed: true,
  };
}

export function removeNodeSessions(
  sessions: LiveSession[],
  nodeId: string,
  activeSessionId: string | null
) {
  const remaining = sessions.filter((session) => session.nodeId !== nodeId);
  const isActiveSessionRemoved =
    activeSessionId !== null &&
    sessions.some((session) => session.id === activeSessionId && session.nodeId === nodeId);

  return {
    activeSessionId: isActiveSessionRemoved ? remaining[0]?.id ?? null : activeSessionId,
    sessions: remaining,
  };
}

export function closeSessionState(
  sessions: LiveSession[],
  sessionId: string,
  activeSessionId: string | null
) {
  const remaining = sessions.filter((session) => session.id !== sessionId);

  return {
    activeSessionId: activeSessionId === sessionId ? remaining[0]?.id ?? null : activeSessionId,
    sessions: remaining,
  };
}

export function updateSessionStatus(
  sessions: LiveSession[],
  sessionId: string,
  status: ConnectionStatus,
  errorMessage?: string
) {
  let changed = false;

  const nextSessions = sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    if (session.status === status && session.errorMessage === errorMessage) {
      return session;
    }

    changed = true;
    return {
      ...session,
      status,
      errorMessage,
    };
  });

  return changed ? nextSessions : sessions;
}

export function selectSessionIdAtIndex(sessions: LiveSession[], index: number) {
  return sessions[index]?.id ?? null;
}

export function selectAdjacentSessionId(
  sessions: LiveSession[],
  activeSessionId: string | null,
  direction: -1 | 1
) {
  if (!activeSessionId || sessions.length === 0) {
    return null;
  }

  const index = sessions.findIndex((session) => session.id === activeSessionId);
  if (index === -1) {
    return null;
  }

  const nextIndex = (index + direction + sessions.length) % sessions.length;
  return sessions[nextIndex]?.id ?? null;
}
