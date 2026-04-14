import { SessionTreeContent } from '@/features/workbench/SessionTreeContent';
import { SessionTreeContextMenu } from '@/features/workbench/SessionTreeContextMenu';
import { SessionTreeFooter } from '@/features/workbench/SessionTreeFooter';
import { SessionTreeHeader } from '@/features/workbench/SessionTreeHeader';
import { SessionTreeSearch } from '@/features/workbench/SessionTreeSearch';
import { buildDesktopWindowChromeLayout } from '@/features/workbench/desktopWindowChromeModel';
import { SESSION_TREE_GRID_ROWS_CLASS } from '@/features/workbench/sessionTreeChromeModel';
import type {
  LiveSession,
  SavedConnectionGroup,
  SavedConnectionProfile,
} from '@/features/workbench/types';
import { useSessionTreeContextMenu } from '@/features/workbench/useSessionTreeContextMenu';
import { useSessionTreeFilter } from '@/features/workbench/useSessionTreeFilter';
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
  onOpenCsvImport: () => void;
  onCreateGroup: () => void;
  onActivateProfile: (profile: SavedConnectionProfile) => void;
  onDeleteProfile: (profile: SavedConnectionProfile) => void;
  onDeleteGroup: (group: SavedConnectionGroup) => void;
  onEditProfile: (profile: SavedConnectionProfile) => void;
  onOpenNodeDashboard: (profile: SavedConnectionProfile) => void;
  onOpenSftp: (profile: SavedConnectionProfile) => void;
  onRenameGroup: (group: SavedConnectionGroup) => void;
  onMoveProfileToGroup: (profile: SavedConnectionProfile) => void;
  onToggleCollapse: () => void;
  onSelectProfile: (profile: SavedConnectionProfile) => void;
  onSelectSession: (sessionId: string) => void;
  onOpenScripts: () => void;
  onOpenSettings: () => void;
};

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
  onOpenCsvImport,
  onCreateGroup,
  onActivateProfile,
  onDeleteProfile,
  onDeleteGroup,
  onEditProfile,
  onOpenNodeDashboard,
  onOpenSftp,
  onRenameGroup,
  onMoveProfileToGroup,
  onToggleCollapse,
  onSelectProfile,
  onSelectSession,
  onOpenScripts,
  onOpenSettings,
}: SessionTreeProps) {
  const desktopWindowChrome = buildDesktopWindowChromeLayout({
    runtime: window.__OPSCLAW_RUNTIME__,
    location: window.location,
  });
  const {
    closeContextMenu,
    contextMenuRef,
    contextMenuState,
    openGroupContextMenu,
    openProfileContextMenu,
    openRootContextMenu,
  } = useSessionTreeContextMenu();
  const {
    clearFilterQuery,
    displayGroups,
    filterQuery,
    handleFilterQueryChange,
    isEmpty,
    isFilterEmpty,
    showClearButton,
  } = useSessionTreeFilter({
    errorMessage,
    groups,
    isLoading,
  });

  return (
    <aside
      className={cn(
        'grid min-h-screen shrink-0 overflow-hidden border-r border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] transition-[width,opacity,border-color] duration-200 ease-out',
        SESSION_TREE_GRID_ROWS_CLASS,
        collapsed ? 'w-0 border-r-transparent opacity-0' : 'w-[276px] opacity-100'
      )}
    >
      <SessionTreeHeader
        desktopTopBarStyle={desktopWindowChrome.topBarStyle}
      />

      <SessionTreeSearch
        filterQuery={filterQuery}
        onClearFilterQuery={clearFilterQuery}
        onFilterQueryChange={handleFilterQueryChange}
        showClearButton={showClearButton}
      />

      <div
        className="min-h-0 overflow-auto px-2 py-3"
        onContextMenu={(event) => {
          event.preventDefault();
          openRootContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <SessionTreeContent
          activeSessionId={activeSessionId}
          displayGroups={displayGroups}
          errorMessage={errorMessage}
          isEmpty={isEmpty}
          isFilterEmpty={isFilterEmpty}
          isLoading={isLoading}
          nodeOnlineStatus={nodeOnlineStatus}
          selectedProfileId={selectedProfileId}
          sessions={sessions}
          onActivateProfile={onActivateProfile}
          onOpenGroupContextMenu={openGroupContextMenu}
          onOpenProfileContextMenu={openProfileContextMenu}
          onSelectProfile={onSelectProfile}
          onSelectSession={onSelectSession}
        />
      </div>

      {contextMenuState ? (
        <SessionTreeContextMenu
          contextMenuRef={contextMenuRef}
          contextMenuState={contextMenuState}
          onActivateProfile={onActivateProfile}
          onCreateGroup={onCreateGroup}
          onDeleteGroup={onDeleteGroup}
          onDeleteProfile={onDeleteProfile}
          onEditProfile={onEditProfile}
          onMoveProfileToGroup={onMoveProfileToGroup}
          onOpenNodeDashboard={onOpenNodeDashboard}
          onOpenSftp={onOpenSftp}
          onOpenCsvImport={onOpenCsvImport}
          onOpenNewConnection={onOpenNewConnection}
          onRenameGroup={onRenameGroup}
          onRequestClose={closeContextMenu}
        />
      ) : null}

      <SessionTreeFooter
        onOpenNewConnection={onOpenNewConnection}
        onOpenScripts={onOpenScripts}
        onOpenSettings={onOpenSettings}
        onToggleCollapse={onToggleCollapse}
      />
    </aside>
  );
}
