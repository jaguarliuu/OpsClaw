import path from 'node:path';

import type {
  SftpConnectionClient,
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
  type: SftpPathType;
  size: number | null;
  modifiedAt: string | null;
  permissions: string | null;
};

type SftpConnectionProvider = Pick<SftpConnectionManager, 'getOrCreate'>;

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

function toIsoTime(epochSeconds: number | undefined) {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds)) {
    return null;
  }

  return new Date(epochSeconds * 1000).toISOString();
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
    type: inferPathType(entry.attrs, entry.longname),
    size: typeof entry.attrs.size === 'number' ? entry.attrs.size : null,
    modifiedAt: toIsoTime(entry.attrs.mtime),
    permissions: formatPermissions(entry.attrs.mode),
  };
}

async function requireConnection(
  connectionManager: SftpConnectionProvider,
  nodeId: string
): Promise<SftpConnectionClient> {
  const trimmedNodeId = nodeId.trim();
  if (!trimmedNodeId) {
    throw new SftpServiceError(400, '节点 ID 不能为空。');
  }

  return connectionManager.getOrCreate(trimmedNodeId);
}

export function createSftpService(dependencies: {
  connectionManager: SftpConnectionProvider;
}) {
  const { connectionManager } = dependencies;

  return {
    async listDirectory(nodeId: string, remotePath: string) {
      const normalizedPath = normalizePath(remotePath, '目录路径');
      const connection = await requireConnection(connectionManager, nodeId);
      const entries = await connection.readDirectory(normalizedPath);
      const normalizedEntries = entries
        .map((entry) => toItem(normalizedPath, entry))
        .sort((left, right) => left.name.localeCompare(right.name));

      return {
        path: normalizedPath,
        entries: normalizedEntries,
      };
    },

    async getMetadata(nodeId: string, remotePath: string) {
      const normalizedPath = normalizePath(remotePath, '路径');
      const connection = await requireConnection(connectionManager, nodeId);
      const metadata = await connection.stat(normalizedPath);

      return {
        name: POSIX_PATH.basename(normalizedPath) || normalizedPath,
        path: normalizedPath,
        type: inferPathType(metadata),
        size: typeof metadata.size === 'number' ? metadata.size : null,
        modifiedAt: toIsoTime(metadata.mtime),
        permissions: formatPermissions(metadata.mode),
      };
    },

    async createDirectory(nodeId: string, remotePath: string) {
      const normalizedPath = normalizePath(remotePath, '目录路径');
      const connection = await requireConnection(connectionManager, nodeId);
      await connection.mkdir(normalizedPath);

      return { path: normalizedPath };
    },

    async renamePath(nodeId: string, sourcePath: string, targetPath: string) {
      const normalizedSourcePath = normalizePath(sourcePath, '原路径');
      const normalizedTargetPath = normalizePath(targetPath, '目标路径');
      const connection = await requireConnection(connectionManager, nodeId);
      await connection.rename(normalizedSourcePath, normalizedTargetPath);

      return {
        sourcePath: normalizedSourcePath,
        targetPath: normalizedTargetPath,
      };
    },

    async deletePaths(nodeId: string, targets: string[]) {
      if (!Array.isArray(targets)) {
        throw new SftpServiceError(400, '删除目标不能为空。');
      }

      const normalizedTargets = Array.from(
        new Set(targets.map((target) => target.trim()).filter(Boolean).map((target) => POSIX_PATH.normalize(target)))
      );
      if (normalizedTargets.length === 0) {
        throw new SftpServiceError(400, '删除目标不能为空。');
      }

      const connection = await requireConnection(connectionManager, nodeId);
      for (const targetPath of normalizedTargets) {
        const metadata = await connection.stat(targetPath);
        const type = inferPathType(metadata);
        if (type === 'directory') {
          await connection.rmdir(targetPath);
          continue;
        }
        await connection.unlink(targetPath);
      }

      return {
        deletedPaths: normalizedTargets,
      };
    },
  };
}
