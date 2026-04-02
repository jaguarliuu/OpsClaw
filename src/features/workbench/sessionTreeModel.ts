import type {
  LiveSession,
  SavedConnectionGroup,
  SavedConnectionProfile,
} from '@/features/workbench/types';

export function buildSessionTreeView(
  groups: SavedConnectionGroup[],
  filterQuery: string,
  isLoading: boolean,
  errorMessage: string | null
) {
  const normalizedQuery = filterQuery.trim().toLowerCase();
  const displayGroups = normalizedQuery
    ? groups
        .map((group) => ({
          ...group,
          profiles: group.profiles.filter((profile) => {
            return (
              profile.name.toLowerCase().includes(normalizedQuery) ||
              profile.host.toLowerCase().includes(normalizedQuery) ||
              profile.username.toLowerCase().includes(normalizedQuery)
            );
          }),
        }))
        .filter((group) => group.profiles.length > 0)
    : groups;

  return {
    displayGroups,
    isEmpty: !isLoading && !errorMessage && groups.length === 0,
    isFilterEmpty: normalizedQuery !== '' && displayGroups.length === 0,
  };
}

export function getRelatedSession(
  sessions: LiveSession[],
  profile: SavedConnectionProfile
) {
  return sessions.find(
    (session) =>
      session.host === profile.host &&
      session.port === profile.port &&
      session.username === profile.username
  );
}

export function getProfileDotClass(
  profile: SavedConnectionProfile,
  linkedSession: LiveSession | undefined,
  nodeOnlineStatus: Record<string, boolean>
) {
  if (linkedSession?.status === 'connected') return 'bg-emerald-500';
  if (
    linkedSession?.status === 'connecting' ||
    linkedSession?.status === 'reconnecting'
  ) {
    return 'bg-amber-400';
  }
  if (nodeOnlineStatus[profile.id] === true) return 'bg-emerald-500 opacity-40';
  return 'bg-neutral-600';
}

export function clampContextMenuPosition(
  point: { x: number; y: number },
  menuSize: { width: number; height: number },
  viewportSize: { width: number; height: number }
) {
  let x = point.x;
  let y = point.y;

  if (x + menuSize.width > viewportSize.width) {
    x = viewportSize.width - menuSize.width - 8;
  }
  if (y + menuSize.height > viewportSize.height) {
    y = viewportSize.height - menuSize.height - 8;
  }
  if (x < 0) x = 8;
  if (y < 0) y = 8;

  return { x, y };
}
