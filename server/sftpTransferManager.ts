import fs from 'node:fs/promises';
import path from 'node:path';

import type { SftpTransferTaskRecord } from './sftpStore.js';

const DEFAULT_CHUNK_SIZE = 256 * 1024;
const POSIX_PATH = path.posix;

type TransferStore = {
  upsertTransferTask: (input: {
    taskId: string;
    nodeId: string;
    direction: 'upload';
    localPath: string;
    remotePath: string;
    tempLocalPath?: null;
    tempRemotePath?: string | null;
    totalBytes?: number | null;
    transferredBytes: number;
    lastConfirmedOffset: number;
    chunkSize: number;
    status: 'running' | 'paused' | 'completed';
    retryCount: number;
    errorMessage?: string | null;
    checksumStatus: 'pending';
  }) => Promise<void>;
  listResumableTasks: (nodeId: string) => Promise<SftpTransferTaskRecord[]>;
};

type TransferConnectionManager = {
  stat: (nodeId: string, remotePath: string) => Promise<{ size?: number }>;
  writeChunk: (nodeId: string, remotePath: string, chunk: Buffer, offset: number) => Promise<void>;
  rename: (nodeId: string, sourcePath: string, targetPath: string) => Promise<void>;
};

export type UploadFileInput = {
  taskId: string;
  nodeId: string;
  localPath: string;
  remotePath: string;
  chunkSize?: number;
};

function createTempRemotePath(taskId: string, remotePath: string) {
  return POSIX_PATH.join(POSIX_PATH.dirname(remotePath), `.opsclaw-upload-${taskId}.tmp`);
}

function assertChunkSize(chunkSize: number) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be greater than 0.');
  }
}

async function assertFinalRemoteSize(
  connectionManager: TransferConnectionManager,
  input: { nodeId: string; tempRemotePath: string; totalBytes: number }
) {
  const metadata = await connectionManager.stat(input.nodeId, input.tempRemotePath);
  const remoteSize = typeof metadata.size === 'number' ? metadata.size : null;
  if (remoteSize !== input.totalBytes) {
    throw new Error('Remote temp file size mismatch before finalize.');
  }
}

function toTaskRecord(input: {
  taskId: string;
  nodeId: string;
  localPath: string;
  remotePath: string;
  tempRemotePath: string | null;
  totalBytes: number;
  transferredBytes: number;
  chunkSize: number;
  status: 'running' | 'paused' | 'completed';
  retryCount: number;
  errorMessage: string | null;
}): SftpTransferTaskRecord {
  const now = new Date().toISOString();
  return {
    taskId: input.taskId,
    nodeId: input.nodeId,
    direction: 'upload',
    localPath: input.localPath,
    remotePath: input.remotePath,
    tempLocalPath: null,
    tempRemotePath: input.tempRemotePath,
    totalBytes: input.totalBytes,
    transferredBytes: input.transferredBytes,
    lastConfirmedOffset: input.transferredBytes,
    chunkSize: input.chunkSize,
    status: input.status,
    retryCount: input.retryCount,
    errorMessage: input.errorMessage,
    checksumStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

export function createSftpTransferManager(dependencies: {
  sftpStore: TransferStore;
  connectionManager: TransferConnectionManager;
}) {
  const { sftpStore, connectionManager } = dependencies;

  const uploadFile = async (input: UploadFileInput) => {
      const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;
      assertChunkSize(chunkSize);
      const stats = await fs.stat(input.localPath);
      const totalBytes = stats.size;
      const resumableTasks = await sftpStore.listResumableTasks(input.nodeId);
      const existingTask = resumableTasks.find((task) => task.taskId === input.taskId) ?? null;
      const tempRemotePath =
        existingTask?.tempRemotePath ?? createTempRemotePath(input.taskId, input.remotePath);
      let offset = Math.min(existingTask?.lastConfirmedOffset ?? 0, totalBytes);
      const retryCount = existingTask?.retryCount ?? 0;

      if (existingTask?.tempRemotePath) {
        try {
          const metadata = await connectionManager.stat(input.nodeId, tempRemotePath);
          const remoteSize = typeof metadata.size === 'number' ? metadata.size : null;
          if (remoteSize === null || remoteSize !== offset || remoteSize > totalBytes) {
            offset = 0;
          }
        } catch {
          offset = 0;
        }
      }

      await sftpStore.upsertTransferTask({
        taskId: input.taskId,
        nodeId: input.nodeId,
        direction: 'upload',
        localPath: input.localPath,
        remotePath: input.remotePath,
        tempLocalPath: null,
        tempRemotePath,
        totalBytes,
        transferredBytes: offset,
        lastConfirmedOffset: offset,
        chunkSize,
        status: 'running',
        retryCount,
        errorMessage: null,
        checksumStatus: 'pending',
      });

      const handle = await fs.open(input.localPath, 'r');

      try {
        if (totalBytes === 0) {
          await connectionManager.writeChunk(input.nodeId, tempRemotePath, Buffer.alloc(0), 0);
        }

        while (offset < totalBytes) {
          const nextChunkSize = Math.min(chunkSize, totalBytes - offset);
          const buffer = Buffer.alloc(nextChunkSize);
          const { bytesRead } = await handle.read(buffer, 0, nextChunkSize, offset);

          if (bytesRead === 0) {
            break;
          }

          const chunk = bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead);
          await connectionManager.writeChunk(input.nodeId, tempRemotePath, chunk, offset);
          offset += bytesRead;

          await sftpStore.upsertTransferTask({
            taskId: input.taskId,
            nodeId: input.nodeId,
            direction: 'upload',
            localPath: input.localPath,
            remotePath: input.remotePath,
            tempLocalPath: null,
            tempRemotePath,
            totalBytes,
            transferredBytes: offset,
            lastConfirmedOffset: offset,
            chunkSize,
            status: 'running',
            retryCount,
            errorMessage: null,
            checksumStatus: 'pending',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sftpStore.upsertTransferTask({
          taskId: input.taskId,
          nodeId: input.nodeId,
          direction: 'upload',
          localPath: input.localPath,
          remotePath: input.remotePath,
          tempLocalPath: null,
          tempRemotePath,
          totalBytes,
          transferredBytes: offset,
          lastConfirmedOffset: offset,
          chunkSize,
          status: 'paused',
          retryCount,
          errorMessage: message,
          checksumStatus: 'pending',
        });
        throw error;
      } finally {
        await handle.close();
      }

      try {
        await assertFinalRemoteSize(connectionManager, {
          nodeId: input.nodeId,
          tempRemotePath,
          totalBytes,
        });
        await connectionManager.rename(input.nodeId, tempRemotePath, input.remotePath);
        await sftpStore.upsertTransferTask({
          taskId: input.taskId,
          nodeId: input.nodeId,
          direction: 'upload',
          localPath: input.localPath,
          remotePath: input.remotePath,
          tempLocalPath: null,
          tempRemotePath: null,
          totalBytes,
          transferredBytes: totalBytes,
          lastConfirmedOffset: totalBytes,
          chunkSize,
          status: 'completed',
          retryCount,
          errorMessage: null,
          checksumStatus: 'pending',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sftpStore.upsertTransferTask({
          taskId: input.taskId,
          nodeId: input.nodeId,
          direction: 'upload',
          localPath: input.localPath,
          remotePath: input.remotePath,
          tempLocalPath: null,
          tempRemotePath,
          totalBytes,
          transferredBytes: offset,
          lastConfirmedOffset: offset,
          chunkSize,
          status: 'paused',
          retryCount,
          errorMessage: message,
          checksumStatus: 'pending',
        });
        throw error;
      }

      return toTaskRecord({
        taskId: input.taskId,
        nodeId: input.nodeId,
        localPath: input.localPath,
        remotePath: input.remotePath,
        tempRemotePath: null,
        totalBytes,
        transferredBytes: totalBytes,
        chunkSize,
        status: 'completed',
        retryCount,
        errorMessage: null,
      });
  };

  return {
    uploadFile,
    async upload(input: UploadFileInput) {
      return uploadFile(input);
    },
  };
}
