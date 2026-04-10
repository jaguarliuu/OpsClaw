import type { RefObject } from 'react';

import type { SessionTreeContextMenuState } from '@/features/workbench/sessionTreeContextMenuModel';
import type {
  SavedConnectionGroup,
  SavedConnectionProfile,
} from '@/features/workbench/types';

type SessionTreeContextMenuProps = {
  contextMenuRef: RefObject<HTMLDivElement | null>;
  contextMenuState: SessionTreeContextMenuState;
  onActivateProfile: (profile: SavedConnectionProfile) => void;
  onCreateGroup: () => void;
  onDeleteGroup: (group: SavedConnectionGroup) => void;
  onDeleteProfile: (profile: SavedConnectionProfile) => void;
  onEditProfile: (profile: SavedConnectionProfile) => void;
  onOpenNodeDashboard: (profile: SavedConnectionProfile) => void;
  onOpenCsvImport: () => void;
  onOpenNewConnection: () => void;
  onRenameGroup: (group: SavedConnectionGroup) => void;
  onMoveProfileToGroup: (profile: SavedConnectionProfile) => void;
  onRequestClose: () => void;
};

export function SessionTreeContextMenu({
  contextMenuRef,
  contextMenuState,
  onActivateProfile,
  onCreateGroup,
  onDeleteGroup,
  onDeleteProfile,
  onEditProfile,
  onOpenNodeDashboard,
  onMoveProfileToGroup,
  onOpenCsvImport,
  onOpenNewConnection,
  onRenameGroup,
  onRequestClose,
}: SessionTreeContextMenuProps) {
  return (
    <div
      className="fixed z-50 min-w-40 rounded-md border border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] p-1 shadow-[0_14px_40px_rgba(0,0,0,0.45)]"
      ref={contextMenuRef}
      style={{
        left: contextMenuState.x,
        top: contextMenuState.y,
      }}
    >
      {contextMenuState.type === 'root' ? (
        <>
          <button
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
            onClick={() => {
              onOpenNewConnection();
              onRequestClose();
            }}
            type="button"
          >
            新建连接
          </button>
          <button
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
            onClick={() => {
              onCreateGroup();
              onRequestClose();
            }}
            type="button"
          >
            新建分组
          </button>
          <button
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
            onClick={() => {
              onOpenCsvImport();
              onRequestClose();
            }}
            type="button"
          >
            批量导入
          </button>
        </>
      ) : null}

      {contextMenuState.type === 'group' ? (
        <>
          <button
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
            onClick={() => {
              onCreateGroup();
              onRequestClose();
            }}
            type="button"
          >
            新建分组
          </button>
          {!contextMenuState.group.isDefault ? (
            <>
              <button
                className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
                onClick={() => {
                  onRenameGroup(contextMenuState.group);
                  onRequestClose();
                }}
                type="button"
              >
                重命名
              </button>
              <div className="my-1 h-px bg-[var(--app-bg-elevated3)]" />
              <button
                className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                onClick={() => {
                  onDeleteGroup(contextMenuState.group);
                  onRequestClose();
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
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
            onClick={() => {
              onActivateProfile(contextMenuState.profile);
              onRequestClose();
            }}
            type="button"
          >
            连接
          </button>
          <button
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
            onClick={() => {
              onEditProfile(contextMenuState.profile);
              onRequestClose();
            }}
            type="button"
          >
            配置
          </button>
          <button
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
            onClick={() => {
              onOpenNodeDashboard(contextMenuState.profile);
              onRequestClose();
            }}
            type="button"
          >
            节点状态
          </button>
          <button
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-elevated3)]"
            onClick={() => {
              onMoveProfileToGroup(contextMenuState.profile);
              onRequestClose();
            }}
            type="button"
          >
            移动到分组
          </button>
          <div className="my-1 h-px bg-[var(--app-bg-elevated3)]" />
          <button
            className="flex w-full items-center rounded px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
            onClick={() => {
              onDeleteProfile(contextMenuState.profile);
              onRequestClose();
            }}
            type="button"
          >
            删除
          </button>
        </>
      ) : null}
    </div>
  );
}
