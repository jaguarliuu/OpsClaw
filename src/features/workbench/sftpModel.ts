import type {
  SftpDirectoryEntry,
  SftpEntryKind,
  SftpTransferTask,
  SftpTransferStatus,
} from './types.js';

export type SftpActionRisk = 'direct' | 'approval';
export type SftpDrawerTab = 'preview' | 'metadata' | 'permissions' | 'tasks';

export type SftpTransferQueueSummary = {
  completedCount: number;
  failedCount: number;
  queuedCount: number;
  runningCount: number;
  totalBytes: number;
  totalCount: number;
  transferredBytes: number;
};

const PREVIEWABLE_FILE_EXTENSIONS = new Set([
  'conf',
  'css',
  'env',
  'ini',
  'json',
  'js',
  'log',
  'md',
  'sh',
  'sql',
  'text',
  'toml',
  'ts',
  'txt',
  'yaml',
  'yml',
]);

export function sortSftpEntries(items: SftpDirectoryEntry[]) {
  return [...items].sort((left, right) => {
    if (left.kind !== right.kind) {
      if (left.kind === 'directory') {
        return -1;
      }
      if (right.kind === 'directory') {
        return 1;
      }
    }

    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

export function classifySftpActionRisk(input: {
  action: 'upload' | 'delete' | 'chmod';
  selectionCount: number;
  overwriting: boolean;
}): SftpActionRisk {
  if (input.action === 'delete' && input.selectionCount > 1) {
    return 'approval';
  }
  if (input.action === 'upload' && input.overwriting) {
    return 'approval';
  }
  if (input.action === 'chmod') {
    return 'approval';
  }

  return 'direct';
}

export function isSftpEntryPreviewable(item: Pick<SftpDirectoryEntry, 'kind' | 'name' | 'size'>) {
  if (item.kind !== 'file') {
    return false;
  }

  if (item.size !== null && item.size > 512 * 1024) {
    return false;
  }

  const extension = item.name.split('.').pop()?.toLowerCase();
  return extension ? PREVIEWABLE_FILE_EXTENSIONS.has(extension) : false;
}

export function buildDefaultSftpDrawerTab(input: {
  kind: SftpEntryKind;
  previewable: boolean;
}): SftpDrawerTab {
  if (input.kind === 'file' && input.previewable) {
    return 'preview';
  }

  return 'metadata';
}

function isRunningTransferStatus(status: SftpTransferStatus) {
  return status === 'running' || status === 'retrying';
}

function isQueuedTransferStatus(status: SftpTransferStatus) {
  return status === 'queued' || status === 'paused' || status === 'awaiting_approval';
}

export function buildTransferQueueSummary(tasks: Pick<SftpTransferTask, 'status' | 'totalBytes' | 'transferredBytes'>[]) {
  return tasks.reduce<SftpTransferQueueSummary>(
    (summary, task) => {
      summary.totalCount += 1;
      summary.totalBytes += task.totalBytes ?? 0;
      summary.transferredBytes += task.transferredBytes;

      if (isRunningTransferStatus(task.status)) {
        summary.runningCount += 1;
      } else if (task.status === 'failed') {
        summary.failedCount += 1;
      } else if (task.status === 'completed') {
        summary.completedCount += 1;
      } else if (isQueuedTransferStatus(task.status)) {
        summary.queuedCount += 1;
      }

      return summary;
    },
    {
      completedCount: 0,
      failedCount: 0,
      queuedCount: 0,
      runningCount: 0,
      totalBytes: 0,
      totalCount: 0,
      transferredBytes: 0,
    }
  );
}
