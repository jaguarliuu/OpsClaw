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
  'listDirectory' | 'stat' | 'mkdir' | 'rename' | 'unlink' | 'rmdir'
>;

const POSIX_PATH = path.posix;
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

    async deletePaths(input: { nodeId: string; paths: string[] }) {
      const nodeId = normalizeNodeId(input.nodeId);
      if (!Array.isArray(input.paths)) {
        throw new SftpServiceError(400, '删除目标不能为空。');
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
        throw new SftpServiceError(400, '删除目标不能为空。');
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
