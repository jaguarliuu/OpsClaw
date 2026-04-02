import type {
  LiveSession,
  SavedConnectionGroup,
  SavedConnectionProfile,
} from '@/features/workbench/types';
import {
  getProfileDotClass,
  getRelatedSession,
} from '@/features/workbench/sessionTreeModel';
import { cn } from '@/lib/utils';

type SessionTreeContentProps = {
  activeSessionId: string | null;
  displayGroups: SavedConnectionGroup[];
  errorMessage: string | null;
  isEmpty: boolean;
  isFilterEmpty: boolean;
  isLoading: boolean;
  nodeOnlineStatus: Record<string, boolean>;
  selectedProfileId: string | null;
  sessions: LiveSession[];
  onActivateProfile: (profile: SavedConnectionProfile) => void;
  onOpenGroupContextMenu: (
    group: SavedConnectionGroup,
    position: { x: number; y: number }
  ) => void;
  onOpenProfileContextMenu: (
    profile: SavedConnectionProfile,
    position: { x: number; y: number }
  ) => void;
  onSelectProfile: (profile: SavedConnectionProfile) => void;
  onSelectSession: (sessionId: string) => void;
};

export function SessionTreeContent({
  activeSessionId,
  displayGroups,
  errorMessage,
  isEmpty,
  isFilterEmpty,
  isLoading,
  nodeOnlineStatus,
  selectedProfileId,
  sessions,
  onActivateProfile,
  onOpenGroupContextMenu,
  onOpenProfileContextMenu,
  onSelectProfile,
  onSelectSession,
}: SessionTreeContentProps) {
  return (
    <>
      {isLoading ? (
        <div className="px-2 text-sm text-neutral-500">正在加载节点...</div>
      ) : null}

      {errorMessage ? (
        <div className="px-2 text-sm text-red-300">{errorMessage}</div>
      ) : null}

      {isEmpty ? (
        <div className="px-2 text-sm text-neutral-500">还没有保存的节点</div>
      ) : null}

      {isFilterEmpty ? (
        <div className="px-2 text-sm text-neutral-500">没有匹配的节点</div>
      ) : null}

      <div className="flex-1">
        {displayGroups.map((group) => (
          <section className="mb-3" key={group.id}>
            <button
              className="mb-1 flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] text-neutral-500 transition-colors hover:bg-neutral-900/70"
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenGroupContextMenu(group, { x: event.clientX, y: event.clientY });
              }}
              type="button"
            >
              <span>{group.name}</span>
              <span>{group.profiles.length}</span>
            </button>

            <div className="space-y-0.5">
              {group.profiles.length === 0 ? (
                <div className="px-2 py-1.5 text-[12px] text-neutral-600">暂无主机</div>
              ) : null}

              {group.profiles.map((profile) => {
                const linkedSession = getRelatedSession(sessions, profile);
                const isActive =
                  selectedProfileId === profile.id || linkedSession?.id === activeSessionId;

                return (
                  <button
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      isActive
                        ? 'bg-[var(--app-bg-elevated3)] text-[var(--app-text-primary)]'
                        : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-elevated3)]'
                    )}
                    key={profile.id}
                    onClick={() => {
                      if (linkedSession) {
                        onSelectSession(linkedSession.id);
                        return;
                      }

                      onSelectProfile(profile);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onSelectProfile(profile);
                      onOpenProfileContextMenu(profile, { x: event.clientX, y: event.clientY });
                    }}
                    onDoubleClick={() => onActivateProfile(profile)}
                    type="button"
                  >
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        getProfileDotClass(profile, linkedSession, nodeOnlineStatus)
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{profile.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
