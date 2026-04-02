import { useCallback, useEffect, useState } from 'react';

import {
  fetchGroups,
  fetchNodes,
  fetchPingAll,
  type GroupRecord,
} from './api';
import type { SavedConnectionProfile } from './types';
import {
  buildNodeOnlineStatus,
  getWorkspaceDataErrorMessage,
  loadWorkspaceData,
} from './workbenchWorkspaceDataModel';

type UseWorkbenchWorkspaceDataOptions = {
  pollIntervalMs?: number;
};

export function useWorkbenchWorkspaceData(
  options: UseWorkbenchWorkspaceDataOptions = {}
) {
  const [savedProfiles, setSavedProfiles] = useState<SavedConnectionProfile[]>([]);
  const [savedGroupRecords, setSavedGroupRecords] = useState<GroupRecord[]>([]);
  const [isLoadingNodes, setIsLoadingNodes] = useState(true);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [nodeOnlineStatus, setNodeOnlineStatus] = useState<Record<string, boolean>>({});

  const refreshWorkspaceData = useCallback(async () => {
    const { groups, profiles } = await loadWorkspaceData({ fetchGroups, fetchNodes });
    setSavedGroupRecords(groups);
    setSavedProfiles(profiles);
    setNodesError(null);
    return { groups, profiles };
  }, []);

  const refreshWorkspaceDataInBackground = useCallback(() => {
    void refreshWorkspaceData().catch((error) => {
      setNodesError(getWorkspaceDataErrorMessage(error));
    });
  }, [refreshWorkspaceData]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setIsLoadingNodes(true);

      try {
        const { groups, profiles } = await loadWorkspaceData({ fetchGroups, fetchNodes });
        if (cancelled) {
          return;
        }

        setSavedGroupRecords(groups);
        setSavedProfiles(profiles);
        setNodesError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setNodesError(getWorkspaceDataErrorMessage(error));
      } finally {
        if (!cancelled) {
          setIsLoadingNodes(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      void fetchPingAll()
        .then((results) => {
          if (cancelled) {
            return;
          }

          setNodeOnlineStatus(buildNodeOnlineStatus(results));
        })
        .catch(() => {});
    };

    poll();
    const id = setInterval(poll, options.pollIntervalMs ?? 30_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [options.pollIntervalMs]);

  return {
    isLoadingNodes,
    nodeOnlineStatus,
    nodesError,
    refreshWorkspaceData,
    refreshWorkspaceDataInBackground,
    savedGroupRecords,
    savedProfiles,
    setNodesError,
    setSavedProfiles,
  };
}
