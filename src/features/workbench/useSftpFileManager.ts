import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pickDownloadTarget, pickUploadFiles } from '@/features/workbench/desktopFileDialogApi';
import { buildSftpApprovalRequest } from '@/features/workbench/sftpActionGateModel';
import { fetchSftpDirectory, fetchSftpTasks } from '@/features/workbench/sftpApi';
import {
  buildDefaultSftpDrawerTab,
  classifySftpActionRisk,
  isSftpEntryPreviewable,
  sortSftpEntries,
  type SftpDrawerTab,
} from '@/features/workbench/sftpModel';
import type { InteractionRequest } from '@/features/workbench/types.agent';
import type {
  SftpDirectoryEntry,
  SftpDirectoryPayload,
  SftpTransferTask,
} from '@/features/workbench/types';

function normalizeSftpPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '.') {
    return '/';
  }

  if (trimmed === '/') {
    return '/';
  }

  return trimmed.replace(/\/+$/, '') || '/';
}

function buildParentSftpPath(path: string) {
  const normalized = normalizeSftpPath(path);
  if (normalized === '/') {
    return '/';
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return '/';
  }

  return `/${segments.slice(0, -1).join('/')}`;
}

function getLocalFileName(filePath: string) {
  return filePath.split(/[/\\]/).filter(Boolean).pop() ?? filePath;
}

function readBatchDeleteRemotePaths(approval: InteractionRequest): string[] {
  if (approval.metadata.kind !== 'batch_delete' || !Array.isArray(approval.metadata.remotePaths)) {
    return [];
  }

  return approval.metadata.remotePaths.filter((path): path is string => typeof path === 'string');
}

function arePathListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function buildApprovalNotice(
  approval: InteractionRequest,
  action: 'approve' | 'reject' | 'dismiss'
) {
  const metadataKind =
    typeof approval.metadata.kind === 'string' ? approval.metadata.kind : null;

  if (metadataKind === 'overwrite_upload') {
    const remotePath =
      typeof approval.metadata.remotePath === 'string'
        ? approval.metadata.remotePath
        : '目标路径';

    if (action === 'approve') {
      return `已确认覆盖 ${remotePath}。当前版本尚未接入上传 mutation API，未执行远端覆盖。`;
    }

    if (action === 'reject') {
      return '已取消覆盖上传，本轮未创建远端传输任务。';
    }

    return '已收起覆盖上传审批卡片。';
  }

  if (metadataKind === 'batch_delete') {
    const count = Array.isArray(approval.metadata.remotePaths)
      ? approval.metadata.remotePaths.length
      : 0;

    if (action === 'approve') {
      return `已确认删除 ${count} 个远端条目。当前版本尚未接入删除 API，未执行远端删除。`;
    }

    if (action === 'reject') {
      return '已取消批量删除，本轮未执行远端删除。';
    }

    return '已收起批量删除审批卡片。';
  }

  if (action === 'approve') {
    return '已确认当前 SFTP 操作，但当前版本尚未接入对应 mutation API。';
  }

  if (action === 'reject') {
    return '已取消当前 SFTP 操作。';
  }

  return '已收起当前 SFTP 审批卡片。';
}

type UseSftpFileManagerInput = {
  nodeId: string | null;
  open: boolean;
};

export function useSftpFileManager(input: UseSftpFileManagerInput) {
  const { nodeId, open } = input;
  const [path, setPath] = useState('/');
  const [directory, setDirectory] = useState<SftpDirectoryPayload | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(false);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [tasks, setTasks] = useState<SftpTransferTask[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<SftpDrawerTab>('metadata');
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<InteractionRequest | null>(null);

  const directoryRequestIdRef = useRef(0);
  const tasksRequestIdRef = useRef(0);
  const selectedPathsRef = useRef<string[]>([]);
  const pendingApprovalRef = useRef<InteractionRequest | null>(null);

  useEffect(() => {
    selectedPathsRef.current = selectedPaths;
  }, [selectedPaths]);

  useEffect(() => {
    pendingApprovalRef.current = pendingApproval;
  }, [pendingApproval]);

  useEffect(() => {
    if (!nodeId || pendingApproval?.metadata.kind !== 'batch_delete') {
      return;
    }

    const visiblePathSet = new Set((directory?.items ?? []).map((item) => item.path));
    const selectedPathSet = new Set(
      selectedPaths.filter((selectedPath) => visiblePathSet.has(selectedPath))
    );
    const currentApprovalPaths = readBatchDeleteRemotePaths(pendingApproval);
    const nextApprovalPaths = currentApprovalPaths.filter((path) => selectedPathSet.has(path));

    if (arePathListsEqual(currentApprovalPaths, nextApprovalPaths)) {
      return;
    }

    if (nextApprovalPaths.length === 0) {
      setPendingApproval(null);
      setNotice('待确认的批量删除条目已失效，请重新选择。');
      return;
    }

    setPendingApproval(
      buildSftpApprovalRequest({
        kind: 'batch_delete',
        nodeId,
        remotePaths: nextApprovalPaths,
      })
    );
    setNotice('部分待确认条目已失效，审批范围已更新为当前可见选中项。');
  }, [directory?.items, nodeId, pendingApproval, selectedPaths]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPath('/');
    setDirectory(null);
    setDirectoryError(null);
    setTasks([]);
    setTasksError(null);
    setSelectedPaths([]);
    setDrawerOpen(false);
    setDrawerTab('metadata');
    setNotice(null);
    setPendingApproval(null);
  }, [nodeId, open]);

  const refreshDirectory = useCallback(async () => {
    if (!open || !nodeId) {
      return;
    }

    const requestId = directoryRequestIdRef.current + 1;
    directoryRequestIdRef.current = requestId;
    setIsDirectoryLoading(true);
    setDirectoryError(null);

    try {
      const payload = await fetchSftpDirectory(nodeId, path);
      if (directoryRequestIdRef.current !== requestId) {
        return;
      }

      const nextItemPathSet = new Set(payload.items.map((item) => item.path));
      const sortedItems = sortSftpEntries(payload.items);

      setDirectory({
        ...payload,
        path: normalizeSftpPath(payload.path),
        items: sortedItems,
      });

      const currentSelectedPaths = selectedPathsRef.current;
      const nextSelectedPaths = currentSelectedPaths.filter((selectedPath) =>
        nextItemPathSet.has(selectedPath)
      );
      if (!arePathListsEqual(currentSelectedPaths, nextSelectedPaths)) {
        setSelectedPaths(nextSelectedPaths);
      }

      const currentPendingApproval = pendingApprovalRef.current;
      if (currentPendingApproval?.metadata.kind === 'batch_delete') {
        const selectedPathSet = new Set(nextSelectedPaths);
        const currentApprovalPaths = readBatchDeleteRemotePaths(currentPendingApproval);
        const nextApprovalPaths = currentApprovalPaths.filter(
          (approvalPath) => nextItemPathSet.has(approvalPath) && selectedPathSet.has(approvalPath)
        );

        if (!arePathListsEqual(currentApprovalPaths, nextApprovalPaths)) {
          if (nextApprovalPaths.length === 0) {
            setPendingApproval(null);
            setNotice('待确认的批量删除条目已失效，请重新选择。');
          } else {
            setPendingApproval(
              buildSftpApprovalRequest({
                kind: 'batch_delete',
                nodeId,
                remotePaths: nextApprovalPaths,
              })
            );
            setNotice('部分待确认条目已失效，审批范围已更新为当前可见选中项。');
          }
        }
      }
    } catch (error) {
      if (directoryRequestIdRef.current !== requestId) {
        return;
      }

      setDirectory(null);
      setDirectoryError(error instanceof Error ? error.message : '读取目录失败。');
    } finally {
      if (directoryRequestIdRef.current === requestId) {
        setIsDirectoryLoading(false);
      }
    }
  }, [nodeId, open, path]);

  const refreshTasks = useCallback(async () => {
    if (!open || !nodeId) {
      return;
    }

    const requestId = tasksRequestIdRef.current + 1;
    tasksRequestIdRef.current = requestId;
    setIsTasksLoading(true);
    setTasksError(null);

    try {
      const payload = await fetchSftpTasks(nodeId);
      if (tasksRequestIdRef.current !== requestId) {
        return;
      }

      setTasks(payload);
    } catch (error) {
      if (tasksRequestIdRef.current !== requestId) {
        return;
      }

      setTasksError(error instanceof Error ? error.message : '读取传输队列失败。');
    } finally {
      if (tasksRequestIdRef.current === requestId) {
        setIsTasksLoading(false);
      }
    }
  }, [nodeId, open]);

  useEffect(() => {
    if (!open || !nodeId) {
      return;
    }

    void refreshDirectory();
  }, [nodeId, open, refreshDirectory]);

  useEffect(() => {
    if (!open || !nodeId) {
      return;
    }

    void refreshTasks();

    const timerId = window.setInterval(() => {
      void refreshTasks();
    }, 5_000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [nodeId, open, refreshTasks]);

  const selectedEntry = useMemo(() => {
    const selectedPath = selectedPaths[0];
    if (!selectedPath) {
      return null;
    }

    return directory?.items.find((item) => item.path === selectedPath) ?? null;
  }, [directory, selectedPaths]);

  const selectEntry = useCallback(
    (entry: SftpDirectoryEntry, options?: { additive?: boolean }) => {
      if (options?.additive) {
        setSelectedPaths((current) =>
          current.includes(entry.path)
            ? current.filter((path) => path !== entry.path)
            : [...current, entry.path]
        );
        return;
      }

      setSelectedPaths([entry.path]);
      setDrawerOpen(true);
      setDrawerTab(
        buildDefaultSftpDrawerTab({
          kind: entry.kind,
          previewable: isSftpEntryPreviewable(entry),
        })
      );
    },
    []
  );

  const openDirectory = useCallback((entry: SftpDirectoryEntry) => {
    if (entry.kind !== 'directory') {
      return;
    }

    setPath(normalizeSftpPath(entry.path));
    setSelectedPaths([]);
    setDrawerOpen(false);
    setDirectory(null);
    setNotice(null);
  }, []);

  const openPath = useCallback((nextPath: string) => {
    setPath(normalizeSftpPath(nextPath));
    setSelectedPaths([]);
    setDrawerOpen(false);
    setDirectory(null);
  }, []);

  const openParentDirectory = useCallback(() => {
    openPath(buildParentSftpPath(path));
  }, [openPath, path]);

  const openTasksDrawer = useCallback(() => {
    setDrawerOpen(true);
    setDrawerTab('tasks');
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const selectDrawerTab = useCallback((tab: SftpDrawerTab) => {
    setDrawerOpen(true);
    setDrawerTab(tab);
  }, []);

  const dismissApproval = useCallback(
    (action: 'reject' | 'dismiss' = 'dismiss') => {
      if (!pendingApproval) {
        return;
      }

      setPendingApproval(null);
      setNotice(buildApprovalNotice(pendingApproval, action));
    },
    [pendingApproval]
  );

  const confirmApproval = useCallback(
    (selectedAction: string, _payload: Record<string, unknown>) => {
      if (selectedAction !== 'approve') {
        dismissApproval('reject');
        return;
      }

      if (!pendingApproval) {
        return;
      }

      setPendingApproval(null);
      setNotice(buildApprovalNotice(pendingApproval, 'approve'));
    },
    [dismissApproval, pendingApproval]
  );

  const handleUploadIntent = useCallback(async () => {
    try {
      const result = await pickUploadFiles();
      if (result.canceled || result.paths.length === 0) {
        setNotice('已取消上传。');
        return;
      }

      const itemByName = new Map(
        (directory?.items ?? []).map((item) => [item.name, item])
      );
      const overwriteCandidate = result.paths
        .map((localPath) => ({
          localPath,
          remoteEntry: itemByName.get(getLocalFileName(localPath)),
        }))
        .find((candidate) => candidate.remoteEntry);

      if (nodeId && overwriteCandidate?.remoteEntry) {
        setPendingApproval(
          buildSftpApprovalRequest({
            kind: 'overwrite_upload',
            nodeId,
            remotePath: overwriteCandidate.remoteEntry.path,
            localPath: overwriteCandidate.localPath,
          })
        );
        setNotice('检测到远端存在同名条目，需先确认覆盖。');
        return;
      }

      setNotice(`已选择 ${result.paths.length} 个本地文件，传输入口将在下一步接入。`);
      setDrawerOpen(true);
      setDrawerTab('tasks');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法打开上传对话框。');
    }
  }, [directory?.items, nodeId]);

  const handleDownloadIntent = useCallback(async () => {
    if (!selectedEntry || selectedEntry.kind !== 'file') {
      setNotice('先选中文件，再选择下载保存位置。');
      return;
    }

    try {
      const result = await pickDownloadTarget(selectedEntry.name);
      if (result.canceled || !result.path) {
        setNotice('已取消下载。');
        return;
      }

      setNotice(`已选择保存位置：${result.path}。下载接口将在下一步接入。`);
      setDrawerOpen(true);
      setDrawerTab('tasks');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法打开下载对话框。');
    }
  }, [selectedEntry]);

  const handleCreateDirectoryIntent = useCallback(() => {
    setNotice('目录创建接口已在服务端就绪，前端表单接入留到下一步。');
  }, []);

  const handleDeleteIntent = useCallback(() => {
    if (!nodeId) {
      return;
    }

    const visiblePathSet = new Set((directory?.items ?? []).map((item) => item.path));
    const visibleSelectedPaths = selectedPaths.filter((selectedPath) =>
      visiblePathSet.has(selectedPath)
    );

    if (visibleSelectedPaths.length === 0) {
      setNotice('先选择要删除的远端条目。');
      return;
    }

    const risk = classifySftpActionRisk({
      action: 'delete',
      selectionCount: visibleSelectedPaths.length,
      overwriting: false,
    });

    if (risk === 'approval') {
      setPendingApproval(
        buildSftpApprovalRequest({
          kind: 'batch_delete',
          nodeId,
          remotePaths: visibleSelectedPaths,
        })
      );
      setNotice('批量删除需要先确认，确认前不会执行远端删除。');
      return;
    }

    setNotice(
      `已请求删除 ${visibleSelectedPaths[0]}。当前版本尚未接入删除 API，未执行远端删除。`
    );
  }, [directory?.items, nodeId, selectedPaths]);

  return {
    confirmApproval,
    closeDrawer,
    directory,
    directoryError,
    dismissApproval,
    drawerOpen,
    drawerTab,
    handleCreateDirectoryIntent,
    handleDeleteIntent,
    handleDownloadIntent,
    handleUploadIntent,
    isDirectoryLoading,
    isTasksLoading,
    notice,
    openDirectory,
    openParentDirectory,
    openPath,
    openTasksDrawer,
    pendingApproval,
    path,
    refreshDirectory,
    refreshTasks,
    selectDrawerTab,
    selectEntry,
    selectedEntry,
    selectedPaths,
    setSelectedPaths,
    tasks,
    tasksError,
  };
}
