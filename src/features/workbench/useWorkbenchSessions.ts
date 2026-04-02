import { useState, type Dispatch, type SetStateAction } from 'react';

import type {
  ConnectionStatus,
  LiveSession,
  SavedConnectionProfile,
} from './types';
import { buildSessionFromProfile } from './workbenchPageModel';
import {
  closeSessionState,
  openSessionState,
  selectAdjacentSessionId,
  selectSessionIdAtIndex,
  updateSessionStatus,
} from './workbenchSessionModel';

type UseWorkbenchSessionsOptions = {
  setIsSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  setSelectedProfileId: Dispatch<SetStateAction<string | null>>;
};

export function useWorkbenchSessions({
  setIsSidebarCollapsed,
  setSelectedProfileId,
}: UseWorkbenchSessionsOptions) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<LiveSession[]>([]);

  const handleActivateProfile = (profile: SavedConnectionProfile) => {
    setSelectedProfileId(profile.id);
    const nextState = openSessionState(sessions, profile, buildSessionFromProfile);

    setSessions(nextState.sessions);
    setActiveSessionId(nextState.activeSessionId);
    setIsSidebarCollapsed(nextState.isSidebarCollapsed);
  };

  const handleSessionStatusChange = (
    sessionId: string,
    status: ConnectionStatus,
    errorMessage?: string
  ) => {
    setSessions((current) => updateSessionStatus(current, sessionId, status, errorMessage));
  };

  const handleCloseSession = (sessionId: string) => {
    setSessions((current) => {
      const nextState = closeSessionState(current, sessionId, activeSessionId);
      if (nextState.activeSessionId !== activeSessionId) {
        setActiveSessionId(nextState.activeSessionId);
      }
      return nextState.sessions;
    });
  };

  const handleSwitchToTabIndex = (index: number) => {
    const sessionId = selectSessionIdAtIndex(sessions, index);
    if (sessionId) {
      setActiveSessionId(sessionId);
    }
  };

  const handleSwitchToPrevTab = () => {
    const sessionId = selectAdjacentSessionId(sessions, activeSessionId, -1);
    if (sessionId) {
      setActiveSessionId(sessionId);
    }
  };

  const handleSwitchToNextTab = () => {
    const sessionId = selectAdjacentSessionId(sessions, activeSessionId, 1);
    if (sessionId) {
      setActiveSessionId(sessionId);
    }
  };

  return {
    activeSessionId,
    handleActivateProfile,
    handleCloseSession,
    handleSessionStatusChange,
    handleSwitchToNextTab,
    handleSwitchToPrevTab,
    handleSwitchToTabIndex,
    sessions,
    setActiveSessionId,
    setSessions,
  };
}
