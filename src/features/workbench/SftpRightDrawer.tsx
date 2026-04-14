import type { ComponentType } from 'react';
import { Eye, FileText, FolderLock, ListTodo, X } from 'lucide-react';

import { SftpTransferQueue } from '@/features/workbench/SftpTransferQueue';
import {
  isSftpEntryPreviewable,
  type SftpDrawerTab,
} from '@/features/workbench/sftpModel';
import {
  SETTINGS_PANEL_MUTED_CLASS,
  SETTINGS_SUBPANEL_CLASS,
  SETTINGS_TEXT_PRIMARY_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
  SETTINGS_TEXT_TERTIARY_CLASS,
} from '@/features/workbench/settingsTheme';
import type {
  SftpDirectoryEntry,
  SftpTransferTask,
} from '@/features/workbench/types';
import { cn } from '@/lib/utils';

function formatBytes(value: number | null) {
  if (value === null) {
    return '--';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toLocaleString('en-US', {
    maximumFractionDigits: current >= 10 ? 0 : 1,
  })} ${units[unitIndex]}`;
}

function formatTimestamp(value: number | null) {
  if (value === null) {
    return '--';
  }

  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  });
}

const TAB_CONFIG: Array<{
  id: SftpDrawerTab;
  icon: ComponentType<{ className?: string }>;
  label: string;
}> = [
  { id: 'preview', icon: Eye, label: '预览' },
  { id: 'metadata', icon: FileText, label: '元数据' },
  { id: 'permissions', icon: FolderLock, label: '权限' },
  { id: 'tasks', icon: ListTodo, label: '队列' },
];

function EmptyDrawerState({ text }: { text: string }) {
  return (
    <div className={cn(SETTINGS_PANEL_MUTED_CLASS, 'px-4 py-6 text-sm', SETTINGS_TEXT_SECONDARY_CLASS)}>
      {text}
    </div>
  );
}

export function SftpRightDrawer({
  onClose,
  onSelectTab,
  open,
  selectedEntry,
  tab,
  tasks,
  tasksError,
  tasksLoading,
}: {
  onClose: () => void;
  onSelectTab: (tab: SftpDrawerTab) => void;
  open: boolean;
  selectedEntry: SftpDirectoryEntry | null;
  tab: SftpDrawerTab;
  tasks: SftpTransferTask[];
  tasksError: string | null;
  tasksLoading: boolean;
}) {
  if (!open) {
    return null;
  }

  const previewable = selectedEntry ? isSftpEntryPreviewable(selectedEntry) : false;

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-l border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)]">
      <div className="flex items-center justify-between border-b border-[var(--app-border-default)] px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Inspector</div>
          <div className={cn('mt-1 text-sm font-semibold', SETTINGS_TEXT_PRIMARY_CLASS)}>
            {selectedEntry ? selectedEntry.name : '右侧抽屉'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-[var(--app-bg-elevated3)] hover:text-[var(--app-text-primary)]"
          title="关闭抽屉"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-[var(--app-border-default)] px-3 py-2">
        {TAB_CONFIG.map((item) => {
          const Icon = item.icon;
          const disabled =
            (!selectedEntry && item.id !== 'tasks') || (item.id === 'preview' && !previewable);

          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectTab(item.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                tab === item.id
                  ? 'bg-blue-500/15 text-blue-200'
                  : 'text-neutral-400 hover:bg-[var(--app-bg-elevated3)] hover:text-neutral-100',
                disabled && 'cursor-not-allowed opacity-40'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tab === 'preview' ? (
          previewable && selectedEntry ? (
            <div className="space-y-3">
              <div className={cn(SETTINGS_SUBPANEL_CLASS, 'px-4 py-4')}>
                <div className={cn('text-sm font-medium', SETTINGS_TEXT_PRIMARY_CLASS)}>
                  预览占位
                </div>
                <div className={cn('mt-2 text-sm leading-6', SETTINGS_TEXT_SECONDARY_CLASS)}>
                  当前阶段仅完成预览 tab 和选中联动，文件内容预览接口将在后续任务中接入。
                </div>
              </div>
              <div className={cn(SETTINGS_SUBPANEL_CLASS, 'px-4 py-4 text-xs', SETTINGS_TEXT_TERTIARY_CLASS)}>
                {selectedEntry.path}
              </div>
            </div>
          ) : (
            <EmptyDrawerState text="该条目当前不支持文本预览，请切换到元数据或权限标签。" />
          )
        ) : null}

        {tab === 'metadata' && selectedEntry ? (
          <div className="space-y-3">
            {[
              ['路径', selectedEntry.path],
              ['类型', selectedEntry.kind],
              ['大小', formatBytes(selectedEntry.size)],
              ['修改时间', formatTimestamp(selectedEntry.mtimeMs)],
              ['权限', selectedEntry.permissions ?? '--'],
            ].map(([label, value]) => (
              <div key={label} className={cn(SETTINGS_SUBPANEL_CLASS, 'px-4 py-3')}>
                <div className={cn('text-xs uppercase tracking-[0.18em]', SETTINGS_TEXT_TERTIARY_CLASS)}>
                  {label}
                </div>
                <div className={cn('mt-2 break-all text-sm', SETTINGS_TEXT_PRIMARY_CLASS)}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'permissions' && selectedEntry ? (
          <div className="space-y-3">
            <div className={cn(SETTINGS_SUBPANEL_CLASS, 'px-4 py-4')}>
              <div className={cn('text-sm font-medium', SETTINGS_TEXT_PRIMARY_CLASS)}>
                当前权限
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-[0.08em] text-amber-100">
                {selectedEntry.permissions ?? '--'}
              </div>
            </div>
            <div className={cn(SETTINGS_PANEL_MUTED_CLASS, 'px-4 py-4 text-sm', SETTINGS_TEXT_SECONDARY_CLASS)}>
              Task 6 只提供读取视图，不在这里直接提交 chmod。高风险变更会放到后续 approval 流中。
            </div>
          </div>
        ) : null}

        {tab === 'tasks' ? (
          <div className="space-y-3">
            {tasksError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {tasksError}
              </div>
            ) : null}
            {tasksLoading ? (
              <div className={cn(SETTINGS_PANEL_MUTED_CLASS, 'px-4 py-4 text-sm', SETTINGS_TEXT_SECONDARY_CLASS)}>
                正在刷新传输队列...
              </div>
            ) : null}
            <SftpTransferQueue
              emptyMessage="当前没有恢复中的上传或下载任务。"
              tasks={tasks}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
