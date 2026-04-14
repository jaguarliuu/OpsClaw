import { useEffect, useState } from 'react';

import type { LiveSession } from './types.js';
import {
  buildOpenSftpViewState,
  buildTerminalPrimaryViewState,
  closeSftpView,
} from './workbenchPrimaryViewModel.js';

function findSessionById(sessions: LiveSession[], sessionId: string | null) {
  if (!sessionId) {
    return null;
  }

  return sessions.find((session) => session.id === sessionId) ?? null;
}

export function useWorkbenchPrimaryView(input: {
  activeSessionId: string | null;
  sessions: LiveSession[];
}) {
  const { activeSessionId, sessions } = input;
  const activeSession = findSessionById(sessions, activeSessionId);
  const [state, setState] = useState(() =>
    buildTerminalPrimaryViewState({
      nodeId: activeSession?.nodeId ?? null,
      sessionId: activeSessionId,
    })
  );

  useEffect(() => {
    setState((current) => {
      if (current.mode === 'sftp') {
        const preservedSession = findSessionById(sessions, current.sessionId);
        const nextSessionId = preservedSession?.id ?? activeSessionId ?? null;

        if (nextSessionId === current.sessionId) {
          return current;
        }

        return {
          ...current,
          sessionId: nextSessionId,
        };
      }

      const nextState = buildTerminalPrimaryViewState({
        nodeId: activeSession?.nodeId ?? null,
        sessionId: activeSessionId,
      });

      if (
        nextState.nodeId === current.nodeId &&
        nextState.sessionId === current.sessionId
      ) {
        return current;
      }

      return nextState;
    });
  }, [activeSession, activeSessionId, sessions]);

  return {
    state,
    closeSftp: () => {
      setState((current) => closeSftpView(current));
    },
    openSftp: (nodeId: string, sessionId?: string | null) => {
      setState((current) => buildOpenSftpViewState(current, { nodeId, sessionId }));
    },
  };
}
