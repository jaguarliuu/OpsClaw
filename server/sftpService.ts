import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  SftpConnectionManager,
  SftpDirectoryEntry,
  SftpFileMetadata,
} from './sftpConnectionManager.js';

export class SftpServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'SftpServiceError';
  }
}

export type SftpPathType = 'file' | 'directory' | 'symlink' | 'other';

export type SftpDirectoryItem = {
  name: string;
  path: string;
  kind: SftpPathType;
  size: number | null;
  mtimeMs: number | null;
  permissions: string | null;
};

export type SftpMetadataItem = {
  name: string;
  path: string;
  kind: SftpPathType;
  size: number | null;
  mtimeMs: number | null;
  permissions: string | null;
};

type SftpConnectionProvider = Pick<
  SftpConnectionManager,
  'listDirectory' | 'stat' | 'readFile' | 'mkdir' | 'writeChunk' | 'rename' | 'unlink' | 'rmdir'
>;

const POSIX_PATH = path.posix;
const DEFAULT_UPLOAD_CHUNK_SIZE = 256 * 1024;
const FILE_TYPE_MASK = 0o170000;
const MODE_DIRECTORY = 0o040000;
const MODE_FILE = 0o100000;
const MODE_SYMLINK = 0o120000;

function normalizePath(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new SftpServiceError(400, `${label}不能为空。`);
  }

  return POSIX_PATH.normalize(trimmed);
}

function toMtimeMs(epochSeconds: number | undefined) {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds)) {
    return null;
  }

  return epochSeconds * 1000;
}

function formatPermissions(mode: number | undefined) {
  if (typeof mode !== 'number') {
    return null;
  }

  const prefix = (() => {
    const fileType = mode & FILE_TYPE_MASK;
    if (fileType === MODE_DIRECTORY) {
      return 'd';
    }
    if (fileType === MODE_FILE) {
      return '-';
    }
    if (fileType === MODE_SYMLINK) {
      return 'l';
    }
    return '?';
  })();

  const triplets = [
    [0o400, 0o200, 0o100],
    [0o040, 0o020, 0o010],
    [0o004, 0o002, 0o001],
  ] as const;
  const parts = triplets
    .map(([readBit, writeBit, executeBit]) => {
      const read = mode & readBit ? 'r' : '-';
      const write = mode & writeBit ? 'w' : '-';
      const execute = mode & executeBit ? 'x' : '-';
      return `${read}${write}${execute}`;
    })
    .join('');

  return `${prefix}${parts}`;
}

function inferPathType(metadata: SftpFileMetadata, longname?: string): SftpPathType {
  if (metadata.isDirectory === true) {
    return 'directory';
  }
  if (metadata.isSymbolicLink === true) {
    return 'symlink';
  }
  if (metadata.isFile === true) {
    return 'file';
  }

  if (typeof metadata.mode === 'number') {
    const fileType = metadata.mode & FILE_TYPE_MASK;
    if (fileType === MODE_DIRECTORY) {
      return 'directory';
    }
    if (fileType === MODE_FILE) {
      return 'file';
    }
    if (fileType === MODE_SYMLINK) {
      return 'symlink';
    }
  }

  if (typeof longname === 'string') {
    const first = longname[0];
    if (first === 'd') {
      return 'directory';
    }
    if (first === 'l') {
      return 'symlink';
    }
    if (first === '-') {
      return 'file';
    }
  }

  return 'other';
}

function toItem(parentPath: string, entry: SftpDirectoryEntry): SftpDirectoryItem {
  const normalizedPath = POSIX_PATH.join(parentPath, entry.filename);
  return {
    name: entry.filename,
    path: normalizedPath,
    kind: inferPathType(entry.attrs, entry.longname),
    size: typeof entry.attrs.size === 'number' ? entry.attrs.size : null,
    mtimeMs: toMtimeMs(entry.attrs.mtime),
    permissions: formatPermissions(entry.attrs.mode),
  };
}

function normalizeNodeId(nodeId: string) {
  const trimmedNodeId = nodeId.trim();
  if (!trimmedNodeId) {
    throw new SftpServiceError(400, '节点 ID 不能为空。');
  }

  return trimmedNodeId;
}

export function createSftpService(dependencies: {
  connectionManager: SftpConnectionProvider;
}) {
  const { connectionManager } = dependencies;

  const uploadChunks = async (input: { nodeId: string; path: string; content: Buffer }) => {
    if (input.content.length === 0) {
      await connectionManager.writeChunk(input.nodeId, input.path, Buffer.alloc(0), 0);
      return;
    }

    let offset = 0;
    while (offset < input.content.length) {
      const nextOffset = Math.min(offset + DEFAULT_UPLOAD_CHUNK_SIZE, input.content.length);
      await connectionManager.writeChunk(
        input.nodeId,
        input.path,
        input.content.subarray(offset, nextOffset),
        offset
      );
      offset = nextOffset;
    }
  };

  return {
    async listDirectory(input: { nodeId: string; path: string }) {
      const nodeId = normalizeNodeId(input.nodeId);
      const normalizedPath = normalizePath(input.path, '目录路径');
      const entries = await connectionManager.listDirectory(nodeId, normalizedPath);
      const normalizedEntries = entries
        .map((entry) => toItem(normalizedPath, entry))
        .sort((left, right) => left.name.localeCompare(right.name));

      return {
        path: normalizedPath,
        items: normalizedEntries,
      };
    },

    async getMetadata(input: { nodeId: string; path: string }): Promise<SftpMetadataItem> {
      const nodeId = normalizeNodeId(input.nodeId);
      const normalizedPath = normalizePath(input.path, '路径');
      const metadata = await connectionManager.stat(nodeId, normalizedPath);

      return {
        name: POSIX_PATH.basename(normalizedPath) || normalizedPath,
        path: normalizedPath,
        kind: inferPathType(metadata),
        size: typeof metadata.size === 'number' ? metadata.size : null,
        mtimeMs: toMtimeMs(metadata.mtime),
        permissions: formatPermissions(metadata.mode),
      };
    },

    async downloadFile(input: { nodeId: string; path: string }) {
      const nodeId = normalizeNodeId(input.nodeId);
      const normalizedPath = normalizePath(input.path, '文件路径');
      const metadata = await connectionManager.stat(nodeId, normalizedPath);
      if (inferPathType(metadata) !== 'file') {
        throw new SftpServiceError(400, '当前仅支持下载文件。');
      }

      const buffer = await connectionManager.readFile(nodeId, normalizedPath);
      return {
        path: normalizedPath,
        name: POSIX_PATH.basename(normalizedPath) || normalizedPath,
        buffer,
      };
    },

    async uploadBuffer(input: {
      nodeId: string;
      path: string;
      content: Buffer;
      fileName?: string | null;
    }) {
      const nodeId = normalizeNodeId(input.nodeId);
      const normalizedPath = normalizePath(input.path, '远端路径');
      await uploadChunks({
        nodeId,
        path: normalizedPath,
        content: input.content,
      });

      return {
        path: normalizedPath,
        size: input.content.length,
      };
    },

    async uploadLocalFile(input: { nodeId: string; localPath: string; remotePath: string }) {
      const nodeId = normalizeNodeId(input.nodeId);
      const localPath = input.localPath.trim();
      if (!localPath) {
        throw new SftpServiceError(400, '本地路径不能为空。');
      }

      const normalizedPath = normalizePath(input.remotePath, '远端路径');
      const content = await fs.readFile(localPath);
      await uploadChunks({
        nodeId,
        path: normalizedPath,
        content,
      });

      return {
        path: normalizedPath,
        size: content.length,
      };
    },

    async createDirectory(input: { nodeId: string; path: string }) {
      const nodeId = normalizeNodeId(input.nodeId);
      const normalizedPath = normalizePath(input.path, '目录路径');
      await connectionManager.mkdir(nodeId, normalizedPath);

      return { path: normalizedPath };
    },

    async renamePath(input: { nodeId: string; fromPath: string; toPath: string }) {
      const nodeId = normalizeNodeId(input.nodeId);
      const normalizedSourcePath = normalizePath(input.fromPath, '原路径');
      const normalizedTargetPath = normalizePath(input.toPath, '目标路径');
      await connectionManager.rename(nodeId, normalizedSourcePath, normalizedTargetPath);

      return {
        fromPath: normalizedSourcePath,
        toPath: normalizedTargetPath,
      };
    },

    async readFileText(input: { nodeId: string; path: string }) {
      const nodeId = normalizeNodeId(input.nodeId);
      const normalizedPath = normalizePath(input.path, '文件路径');
      const metadata = await connectionManager.stat(nodeId, normalizedPath);
      if (inferPathType(metadata) !== 'file') {
        throw new SftpServiceError(400, '仅支持预览文件。');
      }

      const size = typeof metadata.size === 'number' ? metadata.size : null;
      if (size !== null && size > 512 * 1024) {
        throw new SftpServiceError(413, '文件超过 512 KB，无法预览。');
      }

      const buffer = await connectionManager.readFile(nodeId, normalizedPath);
      return { path: normalizedPath, content: buffer.toString('utf-8') };
    },

    async deletePaths(input: { nodeId: string; paths: string[] }) {
      const nodeId = normalizeNodeId(input.nodeId);
      if (!Array.isArray(input.paths)) {
        throw new SftpServiceError(400, '至少选择一个目标。');
      }

      const normalizedTargets = Array.from(
        new Set(
          input.paths
            .map((target) => target.trim())
            .filter(Boolean)
            .map((target) => POSIX_PATH.normalize(target))
        )
      );
      if (normalizedTargets.length === 0) {
        throw new SftpServiceError(400, '至少选择一个目标。');
      }

      for (const targetPath of normalizedTargets) {
        const metadata = await connectionManager.stat(nodeId, targetPath);
        const type = inferPathType(metadata);
        if (type === 'directory') {
          await connectionManager.rmdir(nodeId, targetPath);
          continue;
        }
        await connectionManager.unlink(nodeId, targetPath);
      }

      return {
        deletedPaths: normalizedTargets,
      };
    },
  };
}
