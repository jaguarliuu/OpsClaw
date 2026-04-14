import { ArrowDownToLine, ArrowUpToLine } from 'lucide-react';

import {
  SETTINGS_SUBPANEL_CLASS,
  SETTINGS_TEXT_PRIMARY_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
  SETTINGS_TEXT_TERTIARY_CLASS,
} from '@/features/workbench/settingsTheme';
import type { SftpTransferTask } from '@/features/workbench/types';
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

function formatTransferProgress(task: SftpTransferTask) {
  if (task.totalBytes === null || task.totalBytes <= 0) {
    return `${formatBytes(task.transferredBytes)} / --`;
  }

  return `${formatBytes(task.transferredBytes)} / ${formatBytes(task.totalBytes)}`;
}

function buildStatusTone(status: SftpTransferTask['status']) {
  if (status === 'failed') {
    return 'text-red-300';
  }
  if (status === 'completed') {
    return 'text-emerald-300';
  }
  if (status === 'running' || status === 'retrying') {
    return 'text-sky-300';
  }

  return 'text-amber-200';
}

export function SftpTransferQueue({
  emptyMessage = '当前没有可展示的传输任务。',
  tasks,
}: {
  emptyMessage?: string;
  tasks: SftpTransferTask[];
}) {
  if (tasks.length === 0) {
    return (
      <div className={cn(SETTINGS_SUBPANEL_CLASS, 'px-4 py-5 text-sm', SETTINGS_TEXT_SECONDARY_CLASS)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const progressRatio =
          task.totalBytes && task.totalBytes > 0
            ? Math.max(0, Math.min(1, task.transferredBytes / task.totalBytes))
            : 0;

        return (
          <div key={task.taskId} className={cn(SETTINGS_SUBPANEL_CLASS, 'px-4 py-3')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={cn('flex items-center gap-2 text-sm font-medium', SETTINGS_TEXT_PRIMARY_CLASS)}>
                  {task.direction === 'upload' ? (
                    <ArrowUpToLine className="h-4 w-4 text-sky-300" />
                  ) : (
                    <ArrowDownToLine className="h-4 w-4 text-emerald-300" />
                  )}
                  <span className="truncate">{task.remotePath}</span>
                </div>
                <div className={cn('mt-1 truncate text-xs', SETTINGS_TEXT_TERTIARY_CLASS)}>
                  {task.localPath}
                </div>
              </div>
              <div className={cn('shrink-0 text-xs font-medium', buildStatusTone(task.status))}>
                {task.status}
              </div>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/20">
              <div
                className="h-full rounded-full bg-blue-500/70 transition-[width]"
                style={{ width: `${progressRatio * 100}%` }}
              />
            </div>

            <div className={cn('mt-2 flex items-center justify-between text-xs', SETTINGS_TEXT_SECONDARY_CLASS)}>
              <span>{formatTransferProgress(task)}</span>
              <span>
                offset {formatBytes(task.lastConfirmedOffset)} · checksum {task.checksumStatus}
              </span>
            </div>

            {task.errorMessage ? (
              <div className="mt-2 text-xs text-red-300">{task.errorMessage}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
