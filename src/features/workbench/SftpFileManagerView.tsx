import {
  ArrowLeft,
  ChevronRight,
  Download,
  File,
  Folder,
  FolderPlus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InteractionCard } from '@/features/workbench/InteractionCard';
import { SftpRightDrawer } from '@/features/workbench/SftpRightDrawer';
import {
  buildTransferQueueSummary,
} from '@/features/workbench/sftpModel';
import {
  SETTINGS_PANEL_CLASS,
  SETTINGS_PANEL_MUTED_CLASS,
  SETTINGS_TEXT_PRIMARY_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
  SETTINGS_TEXT_TERTIARY_CLASS,
} from '@/features/workbench/settingsTheme';
import { useSftpFileManager } from '@/features/workbench/useSftpFileManager';
import { cn } from '@/lib/utils';

function buildBreadcrumbs(path: string) {
  if (path === '/') {
    return [{ label: '/', path: '/' }];
  }

  const segments = path.split('/').filter(Boolean);
  return [
    { label: '/', path: '/' },
    ...segments.map((segment, index) => ({
      label: segment,
      path: `/${segments.slice(0, index + 1).join('/')}`,
    })),
  ];
}

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

function renderEntryIcon() {
  return <File className="h-4 w-4 text-neutral-400" />;
}

export function SftpFileManagerView({
  nodeId,
  nodeName,
  onClose,
}: {
  nodeId: string;
  nodeName?: string | null;
  onClose: () => void;
}) {
  const model = useSftpFileManager({
    nodeId,
    open: true,
  });
  const currentPath = model.directory?.path ?? model.path;
  const breadcrumbs = buildBreadcrumbs(currentPath);
  const queueSummary = buildTransferQueueSummary(model.tasks);

  return (
    <section
      className={cn(
        'grid min-h-screen min-w-0 flex-1 bg-[var(--app-bg-elevated)]',
        model.drawerOpen ? 'grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-[minmax(0,1fr)]'
      )}
    >
      <div className="flex min-w-0 flex-col">
        <div className="border-b border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--app-text-primary)]">SFTP</div>
              <div className="truncate text-sm text-[var(--app-text-secondary)]">
                {nodeName ?? nodeId}
              </div>
            </div>
            <Button
              className="shrink-0"
              onClick={onClose}
              size="sm"
              type="button"
              variant="ghost"
            >
              返回终端
            </Button>
          </div>
        </div>

        <div className="border-b border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={currentPath === '/'}
              onClick={model.openParentDirectory}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              上一级
            </Button>
            <Button onClick={() => void model.refreshDirectory()} size="sm" type="button" variant="secondary">
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
            <Button onClick={() => void model.handleUploadIntent()} size="sm" type="button" variant="ghost">
              <Upload className="mr-1 h-4 w-4" />
              上传
            </Button>
            <Button onClick={model.handleDeleteIntent} size="sm" type="button" variant="ghost">
              <Trash2 className="mr-1 h-4 w-4" />
              删除
            </Button>
            <Button
              onClick={() => void model.handleDownloadIntent()}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Download className="mr-1 h-4 w-4" />
              下载
            </Button>
            <Button
              onClick={model.handleCreateDirectoryIntent}
              size="sm"
              type="button"
              variant="ghost"
            >
              <FolderPlus className="mr-1 h-4 w-4" />
              新建目录
            </Button>
            <span className={cn('text-xs', SETTINGS_TEXT_TERTIARY_CLASS)}>
              已选 {model.selectedPaths.length} 项，按 Ctrl/Cmd + 点击可多选。
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1 text-sm text-neutral-400">
            {breadcrumbs.map((item, index) => (
              <div className="flex items-center gap-1" key={item.path}>
                {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-neutral-600" /> : null}
                <button
                  type="button"
                  onClick={() => model.openPath(item.path)}
                  className="rounded px-1.5 py-0.5 transition-colors hover:bg-[var(--app-bg-elevated3)] hover:text-neutral-100"
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>

          {model.notice ? (
            <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">
              {model.notice}
            </div>
          ) : null}
          {model.directoryError ? (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {model.directoryError}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 px-4 py-4">
          {model.pendingApproval ? (
            <div className={cn(SETTINGS_PANEL_CLASS, 'overflow-hidden')}>
              <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border-default)] px-4 py-3">
                <div>
                  <div className={cn('text-xs uppercase tracking-[0.2em]', SETTINGS_TEXT_TERTIARY_CLASS)}>
                    Approval Required
                  </div>
                  <div className={cn('mt-1 text-sm font-medium', SETTINGS_TEXT_PRIMARY_CLASS)}>
                    待确认的 SFTP 操作
                  </div>
                </div>
                <Button onClick={() => model.dismissApproval()} size="sm" type="button" variant="ghost">
                  稍后处理
                </Button>
              </div>
              <div className="p-4">
                <InteractionCard
                  request={model.pendingApproval}
                  onSubmit={(actionId, payload) => {
                    if (actionId === 'approve') {
                      model.confirmApproval(actionId, payload);
                      return;
                    }

                    model.dismissApproval('reject');
                  }}
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <button
              type="button"
              onClick={model.openTasksDrawer}
              className={cn(
                SETTINGS_PANEL_CLASS,
                'px-4 py-3 text-left transition-colors hover:border-blue-500/30 hover:bg-blue-500/5'
              )}
            >
              <div className={cn('text-xs uppercase tracking-[0.2em]', SETTINGS_TEXT_TERTIARY_CLASS)}>
                Running
              </div>
              <div className={cn('mt-2 text-2xl font-semibold', SETTINGS_TEXT_PRIMARY_CLASS)}>
                {queueSummary.runningCount}
              </div>
            </button>
            <button
              type="button"
              onClick={model.openTasksDrawer}
              className={cn(
                SETTINGS_PANEL_CLASS,
                'px-4 py-3 text-left transition-colors hover:border-blue-500/30 hover:bg-blue-500/5'
              )}
            >
              <div className={cn('text-xs uppercase tracking-[0.2em]', SETTINGS_TEXT_TERTIARY_CLASS)}>
                Failed
              </div>
              <div className="mt-2 text-2xl font-semibold text-red-200">{queueSummary.failedCount}</div>
            </button>
            <button
              type="button"
              onClick={model.openTasksDrawer}
              className={cn(
                SETTINGS_PANEL_CLASS,
                'px-4 py-3 text-left transition-colors hover:border-blue-500/30 hover:bg-blue-500/5'
              )}
            >
              <div className={cn('text-xs uppercase tracking-[0.2em]', SETTINGS_TEXT_TERTIARY_CLASS)}>
                Queue
              </div>
              <div className={cn('mt-2 text-2xl font-semibold', SETTINGS_TEXT_PRIMARY_CLASS)}>
                {queueSummary.queuedCount}
              </div>
            </button>
            <button
              type="button"
              onClick={model.openTasksDrawer}
              className={cn(
                SETTINGS_PANEL_CLASS,
                'px-4 py-3 text-left transition-colors hover:border-blue-500/30 hover:bg-blue-500/5'
              )}
            >
              <div className={cn('text-xs uppercase tracking-[0.2em]', SETTINGS_TEXT_TERTIARY_CLASS)}>
                Data
              </div>
              <div className={cn('mt-2 text-lg font-semibold', SETTINGS_TEXT_PRIMARY_CLASS)}>
                {formatBytes(queueSummary.transferredBytes)} / {formatBytes(queueSummary.totalBytes)}
              </div>
            </button>
          </div>

          <div className={cn(SETTINGS_PANEL_CLASS, 'min-h-0 overflow-hidden')}>
            <div className="grid grid-cols-[minmax(0,1.8fr)_120px_140px_180px] gap-3 border-b border-[var(--app-border-default)] px-4 py-3 text-xs uppercase tracking-[0.2em] text-neutral-500">
              <span>名称</span>
              <span>类型</span>
              <span>大小</span>
              <span>修改时间</span>
            </div>

            {model.isDirectoryLoading ? (
              <div className={cn('px-4 py-10 text-sm', SETTINGS_TEXT_SECONDARY_CLASS)}>
                正在读取远端目录...
              </div>
            ) : null}

            {!model.isDirectoryLoading && (model.directory?.items.length ?? 0) === 0 ? (
              <div className={cn(SETTINGS_PANEL_MUTED_CLASS, 'm-4 px-4 py-8 text-sm', SETTINGS_TEXT_SECONDARY_CLASS)}>
                当前目录为空。
              </div>
            ) : null}

            <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
              {model.directory?.items.map((entry) => {
                const isSelected = model.selectedEntry?.path === entry.path;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={(event) =>
                      model.selectEntry(entry, {
                        additive: event.metaKey || event.ctrlKey,
                      })
                    }
                    onDoubleClick={() => model.openDirectory(entry)}
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1.8fr)_120px_140px_180px] gap-3 border-b border-[var(--app-border-default)]/70 px-4 py-3 text-left transition-colors',
                      isSelected
                        ? 'bg-blue-500/10'
                        : 'hover:bg-[var(--app-bg-elevated3)]/70'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {entry.kind === 'directory' ? (
                        <Folder className="h-4 w-4 shrink-0 text-sky-300" />
                      ) : (
                        renderEntryIcon()
                      )}
                      <span className={cn('truncate text-sm', SETTINGS_TEXT_PRIMARY_CLASS)}>{entry.name}</span>
                    </span>
                    <span className={cn('truncate text-sm', SETTINGS_TEXT_SECONDARY_CLASS)}>{entry.kind}</span>
                    <span className={cn('truncate text-sm', SETTINGS_TEXT_SECONDARY_CLASS)}>
                      {formatBytes(entry.size)}
                    </span>
                    <span className={cn('truncate text-sm', SETTINGS_TEXT_TERTIARY_CLASS)}>
                      {formatTimestamp(entry.mtimeMs)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {model.drawerOpen ? (
        <SftpRightDrawer
          onClose={model.closeDrawer}
          onSelectTab={model.selectDrawerTab}
          open={model.drawerOpen}
          selectedEntry={model.selectedEntry}
          tab={model.drawerTab}
          tasks={model.tasks}
          tasksError={model.tasksError}
          tasksLoading={model.isTasksLoading}
        />
      ) : null}
    </section>
  );
}
