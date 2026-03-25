import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type {
  LiveSession,
  SavedConnectionGroup,
  SavedConnectionProfile,
} from '@/features/workbench/types';
import { cn } from '@/lib/utils';

type SessionTreeProps = {
  activeSessionId: string | null;
  collapsed: boolean;
  groups: SavedConnectionGroup[];
  sessions: LiveSession[];
  selectedProfileId: string | null;
  isLoading: boolean;
  errorMessage: string | null;
  nodeOnlineStatus: Record<string, boolean>;
  onOpenNewConnection: () => void;
  onCreateGroup: () => void;
  onActivateProfile: (profile: SavedConnectionProfile) => void;
  onDeleteProfile: (profile: SavedConnectionProfile) => void;
  onDeleteGroup: (group: SavedConnectionGroup) => void;
  onEditProfile: (profile: SavedConnectionProfile) => void;
  onRenameGroup: (group: SavedConnectionGroup) => void;
  onMoveProfileToGroup: (profile: SavedConnectionProfile) => void;
  onToggleCollapse: () => void;
  onSelectProfile: (profile: SavedConnectionProfile) => void;
  onSelectSession: (sessionId: string) => void;
  onOpenSettings: () => void;
};

type ContextMenuState =
  | {
      type: 'root';
      x: number;
      y: number;
    }
  | {
      type: 'group';
      group: SavedConnectionGroup;
      x: number;
      y: number;
    }
  | {
      type: 'profile';
      profile: SavedConnectionProfile;
      x: number;
      y: number;
    };

function getRelatedSession(
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

function getProfileDotClass(
  profile: SavedConnectionProfile,
  linkedSession: LiveSession | undefined,
  nodeOnlineStatus: Record<string, boolean>
): string {
  if (linkedSession?.status === 'connected') return 'bg-emerald-500';
  if (linkedSession?.status === 'connecting' || linkedSession?.status === 'reconnecting') return 'bg-amber-400';
  if (nodeOnlineStatus[profile.id] === true) return 'bg-emerald-500 opacity-40';
  return 'bg-neutral-600';
}

export function SessionTree({
  activeSessionId,
  collapsed,
  groups,
  sessions,
  selectedProfileId,
  isLoading,
  errorMessage,
  nodeOnlineStatus,
  onOpenNewConnection,
  onCreateGroup,
  onActivateProfile,
  onDeleteProfile,
  onDeleteGroup,
  onEditProfile,
  onRenameGroup,
  onMoveProfileToGroup,
  onToggleCollapse,
  onSelectProfile,
  onSelectSession,
  onOpenSettings,
}: SessionTreeProps) {
  const isEmpty = !isLoading && !errorMessage && groups.length === 0;
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  const displayGroups = filterQuery.trim()
    ? groups
        .map((g) => ({
          ...g,
          profiles: g.profiles.filter(
            (p) =>
              p.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
              p.host.toLowerCase().includes(filterQuery.toLowerCase()) ||
              p.username.toLowerCase().includes(filterQuery.toLowerCase())
          ),
        }))
        .filter((g) => g.profiles.length > 0)
    : groups;

  const isFilterEmpty = filterQuery.trim() !== '' && displayGroups.length === 0;

  useLayoutEffect(() => {
    if (!contextMenuState || !contextMenuRef.current) return;
    const menu = contextMenuRef.current;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = contextMenuState.x;
    let y = contextMenuState.y;
    if (rect.right > vw) x = vw - rect.width - 8;
    if (rect.bottom > vh) y = vh - rect.height - 8;
    if (x < 0) x = 8;
    if (y < 0) y = 8;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }, [contextMenuState]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const closeMenu = () => setContextMenuState(null);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        closeMenu();
        return;
      }

      if (contextMenuRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuState]);

  return (
    <aside
      className={cn(
        'grid min-h-screen shrink-0 grid-rows-[auto_1fr_auto] overflow-hidden border-r border-neutral-800 bg-[#141519] transition-[width,opacity,border-color] duration-200 ease-out',
        collapsed ? 'w-0 border-r-transparent opacity-0' : 'w-[276px] opacity-100'
      )}
    >
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <strong className="text-[15px] font-medium text-neutral-100">连接管理器</strong>
        <div className="flex items-center gap-1">
          <Button onClick={onOpenNewConnection} size="sm" variant="ghost">
            新建
          </Button>
          <Button aria-label="折叠连接管理器" onClick={onToggleCollapse} size="sm" variant="ghost">
            ←
          </Button>
        </div>
      </header>

      <div className="border-b border-neutral-800/60 px-3 py-2">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
          </svg>
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="过滤节点..."
            className="w-full rounded-md bg-neutral-800/60 py-1.5 pl-7 pr-6 text-[12px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:bg-neutral-800"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 overflow-auto px-2 py-3">
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

        <div
          className="min-h-full"
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenuState({
              type: 'root',
              x: event.clientX,
              y: event.clientY,
            });
          }}
        >
          {displayGroups.map((group) => (
            <section className="mb-3" key={group.id}>
              <button
                className="mb-1 flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] text-neutral-500 transition-colors hover:bg-neutral-900/70"
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenuState({
                    type: 'group',
                    group,
                    x: event.clientX,
                    y: event.clientY,
                  });
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
                          ? 'bg-neutral-800 text-neutral-100'
                          : 'text-neutral-300 hover:bg-neutral-800'
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
                        setContextMenuState({
                          type: 'profile',
                          profile,
                          x: event.clientX,
                          y: event.clientY,
                        });
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
      </div>

      {contextMenuState ? (
        <div
          className="fixed z-50 min-w-40 rounded-md border border-neutral-800 bg-[#17191d] p-1 shadow-[0_14px_40px_rgba(0,0,0,0.45)]"
          ref={contextMenuRef}
          style={{
            left: contextMenuState.x,
            top: contextMenuState.y,
          }}
        >
          {contextMenuState.type === 'root' ? (
            <>
              <button
                className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                onClick={() => {
                  onOpenNewConnection();
                  setContextMenuState(null);
                }}
                type="button"
              >
                新建连接
              </button>
              <button
                className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                onClick={() => {
                  onCreateGroup();
                  setContextMenuState(null);
                }}
                type="button"
              >
                新建分组
              </button>
            </>
          ) : null}

          {contextMenuState.type === 'group' ? (
            <>
              <button
                className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                onClick={() => {
                  onCreateGroup();
                  setContextMenuState(null);
                }}
                type="button"
              >
                新建分组
              </button>
              {!contextMenuState.group.isDefault ? (
                <>
                  <button
                    className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                    onClick={() => {
                      onRenameGroup(contextMenuState.group);
                      setContextMenuState(null);
                    }}
                    type="button"
                  >
                    重命名
                  </button>
                  <div className="my-1 h-px bg-neutral-800" />
                  <button
                    className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                    onClick={() => {
                      onDeleteGroup(contextMenuState.group);
                      setContextMenuState(null);
                    }}
                    type="button"
                  >
                    删除分组
                  </button>
                </>
              ) : null}
            </>
          ) : null}

          {contextMenuState.type === 'profile' ? (
            <>
              <button
                className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                onClick={() => {
                  onActivateProfile(contextMenuState.profile);
                  setContextMenuState(null);
                }}
                type="button"
              >
                连接
              </button>
              <button
                className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                onClick={() => {
                  onEditProfile(contextMenuState.profile);
                  setContextMenuState(null);
                }}
                type="button"
              >
                配置
              </button>
              <button
                className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                onClick={() => {
                  onMoveProfileToGroup(contextMenuState.profile);
                  setContextMenuState(null);
                }}
                type="button"
              >
                移动到分组
              </button>
              <div className="my-1 h-px bg-neutral-800" />
              <button
                className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                onClick={() => {
                  onDeleteProfile(contextMenuState.profile);
                  setContextMenuState(null);
                }}
                type="button"
              >
                删除
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Bottom nav */}
      <footer className="border-t border-neutral-800 px-2 py-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-800/60 hover:text-neutral-300"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          终端设置
        </button>
      </footer>
    </aside>
  );
}
