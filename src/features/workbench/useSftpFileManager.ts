import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pickDownloadTarget, pickUploadFiles } from '@/features/workbench/desktopFileDialogApi';
import { fetchSftpDirectory, fetchSftpTasks } from '@/features/workbench/sftpApi';
import {
  buildDefaultSftpDrawerTab,
  isSftpEntryPreviewable,
  sortSftpEntries,
  type SftpDrawerTab,
} from '@/features/workbench/sftpModel';
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

  const directoryRequestIdRef = useRef(0);
  const tasksRequestIdRef = useRef(0);

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

      setDirectory({
        ...payload,
        path: normalizeSftpPath(payload.path),
        items: sortSftpEntries(payload.items),
      });
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

  const selectEntry = useCallback((entry: SftpDirectoryEntry) => {
    setSelectedPaths([entry.path]);
    setDrawerOpen(true);
    setDrawerTab(
      buildDefaultSftpDrawerTab({
        kind: entry.kind,
        previewable: isSftpEntryPreviewable(entry),
      })
    );
  }, []);

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

  const handleUploadIntent = useCallback(async () => {
    try {
      const result = await pickUploadFiles();
      if (result.canceled || result.paths.length === 0) {
        setNotice('已取消上传。');
        return;
      }

      setNotice(`已选择 ${result.paths.length} 个本地文件，传输入口将在下一步接入。`);
      setDrawerOpen(true);
      setDrawerTab('tasks');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法打开上传对话框。');
    }
  }, []);

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

  return {
    closeDrawer,
    directory,
    directoryError,
    drawerOpen,
    drawerTab,
    handleCreateDirectoryIntent,
    handleDownloadIntent,
    handleUploadIntent,
    isDirectoryLoading,
    isTasksLoading,
    notice,
    openDirectory,
    openParentDirectory,
    openPath,
    openTasksDrawer,
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
