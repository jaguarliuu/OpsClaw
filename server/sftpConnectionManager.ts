import { createHash } from 'node:crypto';

import ssh2, { Client, type ConnectConfig, type SFTPWrapper } from 'ssh2';

import type { SftpStore } from './http/support.js';
import type { StoredNodeWithSecrets } from './nodeStore.js';

export type SftpFileMetadata = {
  mode?: number;
  size?: number;
  atime?: number;
  mtime?: number;
  isDirectory?: boolean;
  isFile?: boolean;
  isSymbolicLink?: boolean;
};

export type SftpDirectoryEntry = {
  filename: string;
  longname?: string;
  attrs: SftpFileMetadata;
};

export type SftpConnectionClient = {
  readDirectory: (path: string) => Promise<SftpDirectoryEntry[]>;
  stat: (path: string) => Promise<SftpFileMetadata>;
  mkdir: (path: string) => Promise<void>;
  rename: (sourcePath: string, targetPath: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  rmdir: (path: string) => Promise<void>;
  end: () => void;
};

export type SftpConnectionManager = {
  getOrCreate: (nodeId: string) => Promise<SftpConnectionClient>;
  listDirectory: (nodeId: string, path: string) => Promise<SftpDirectoryEntry[]>;
  stat: (nodeId: string, path: string) => Promise<SftpFileMetadata>;
  mkdir: (nodeId: string, path: string) => Promise<void>;
  rename: (nodeId: string, sourcePath: string, targetPath: string) => Promise<void>;
  unlink: (nodeId: string, path: string) => Promise<void>;
  rmdir: (nodeId: string, path: string) => Promise<void>;
  closeNode: (nodeId: string) => Promise<void>;
  destroy: (nodeId: string) => Promise<void>;
  destroyAll: () => Promise<void>;
};

type NodeStore = {
  getNodeWithSecrets: (nodeId: string) => StoredNodeWithSecrets | null;
};
export type HostKeyObservation = {
  algorithm: string;
  fingerprint: string;
};

export type SftpClientCreationOptions = {
  onHostKey: (observation: HostKeyObservation) => Promise<void>;
};

export type CreateSftpClient = (
  node: StoredNodeWithSecrets,
  options: SftpClientCreationOptions
) => Promise<SftpConnectionClient>;

type HostVerifierCallback = (verified: boolean) => void;

type Ssh2ClientLike = {
  on: (event: string, handler: (...args: unknown[]) => void) => Ssh2ClientLike;
  sftp: (callback: (error: Error | null, sftp: SFTPWrapper) => void) => void;
  connect: (options: ConnectConfig) => void;
  end: () => void;
};

type ParseKeyFn = (key: Buffer) => unknown;

type Ssh2RuntimeDependencies = {
  createClient: () => Ssh2ClientLike;
  parseKey: ParseKeyFn;
};

const defaultSsh2RuntimeDependencies: Ssh2RuntimeDependencies = {
  createClient: () => new Client() as unknown as Ssh2ClientLike,
  parseKey: (key) => ssh2.utils.parseKey(key),
};

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapStats(stats: unknown): SftpFileMetadata {
  if (!stats || typeof stats !== 'object') {
    return {};
  }

  const value = stats as {
    mode?: unknown;
    size?: unknown;
    atime?: unknown;
    mtime?: unknown;
    isDirectory?: () => boolean;
    isFile?: () => boolean;
    isSymbolicLink?: () => boolean;
  };

  return {
    mode: readNumber(value.mode),
    size: readNumber(value.size),
    atime: readNumber(value.atime),
    mtime: readNumber(value.mtime),
    isDirectory: typeof value.isDirectory === 'function' ? value.isDirectory() : undefined,
    isFile: typeof value.isFile === 'function' ? value.isFile() : undefined,
    isSymbolicLink: typeof value.isSymbolicLink === 'function' ? value.isSymbolicLink() : undefined,
  };
}

function toFingerprint(hostKey: Buffer) {
  return `SHA256:${createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}`;
}

function readParsedKeyType(parsedKey: unknown): string | null {
  if (!parsedKey || typeof parsedKey !== 'object') {
    return null;
  }

  const value = parsedKey as { type?: unknown };
  return typeof value.type === 'string' && value.type.trim().length > 0 ? value.type : null;
}

function parseHostKeyAlgorithm(parseKey: ParseKeyFn, hostKey: Buffer) {
  const parsed = parseKey(hostKey);
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const keyType = readParsedKeyType(entry);
      if (keyType) {
        return keyType;
      }
    }
    return 'unknown';
  }

  return readParsedKeyType(parsed) ?? 'unknown';
}

function wrapSftpClient(client: Client, sftp: SFTPWrapper): SftpConnectionClient {
  return {
    readDirectory(path) {
      return new Promise((resolve, reject) => {
        sftp.readdir(path, (error, entries) => {
          if (error) {
            reject(error);
            return;
          }

          const normalized = (entries ?? []).map((entry) => {
            const typedEntry = entry as {
              filename?: unknown;
              longname?: unknown;
              attrs?: unknown;
            };

            return {
              filename: typeof typedEntry.filename === 'string' ? typedEntry.filename : '',
              longname: typeof typedEntry.longname === 'string' ? typedEntry.longname : undefined,
              attrs: mapStats(typedEntry.attrs),
            };
          });
          resolve(normalized.filter((entry) => entry.filename.length > 0));
        });
      });
    },

    stat(path) {
      return new Promise((resolve, reject) => {
        sftp.stat(path, (error, stats) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(mapStats(stats));
        });
      });
    },

    mkdir(path) {
      return new Promise((resolve, reject) => {
        sftp.mkdir(path, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },

    rename(sourcePath, targetPath) {
      return new Promise((resolve, reject) => {
        sftp.rename(sourcePath, targetPath, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },

    unlink(path) {
      return new Promise((resolve, reject) => {
        sftp.unlink(path, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },

    rmdir(path) {
      return new Promise((resolve, reject) => {
        sftp.rmdir(path, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },

    end() {
      client.end();
    },
  };
}

async function createSsh2SftpClient(
  node: StoredNodeWithSecrets,
  options: SftpClientCreationOptions,
  ssh2Runtime: Ssh2RuntimeDependencies
) {
  return new Promise<SftpConnectionClient>((resolve, reject) => {
    const client = ssh2Runtime.createClient();
    let settled = false;
    let hostVerificationError: Error | null = null;

    const settleReject = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      client.end();
      reject(error);
    };

    client.on('error', (error) => {
      const normalizedError =
        hostVerificationError ??
        (error instanceof Error ? error : new Error(String(error)));
      settleReject(normalizedError);
    });

    client.on('ready', () => {
      client.sftp((error, sftp) => {
        if (error) {
          settleReject(error);
          return;
        }

        if (settled) {
          client.end();
          return;
        }

        settled = true;
        resolve(wrapSftpClient(client as Client, sftp));
      });
    });

    const connectOptions: ConnectConfig = {
      host: node.host,
      port: node.port,
      username: node.username,
    };

    if (node.authMode === 'password') {
      if (!node.password) {
        throw new Error(`Node "${node.id}" does not provide a password for SFTP auth.`);
      }
      connectOptions.password = node.password;
    } else {
      if (!node.privateKey) {
        throw new Error(`Node "${node.id}" does not provide a private key for SFTP auth.`);
      }
      connectOptions.privateKey = node.privateKey;
      connectOptions.passphrase = node.passphrase ?? undefined;
    }
    connectOptions.hostVerifier = (key: Buffer | string, callback?: HostVerifierCallback) => {
      const hostKey = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
      const algorithm = parseHostKeyAlgorithm(ssh2Runtime.parseKey, hostKey);
      const fingerprint = toFingerprint(hostKey);

      void options
        .onHostKey({ algorithm, fingerprint })
        .then(() => {
          callback?.(true);
        })
        .catch((error) => {
          hostVerificationError = error instanceof Error ? error : new Error(String(error));
          callback?.(false);
        });
    };

    try {
      client.connect(connectOptions);
    } catch (error) {
      settleReject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function createSftpConnectionManager(dependencies: {
  nodeStore: NodeStore;
  sftpStore: Pick<SftpStore, 'getHostKey' | 'upsertHostKey'>;
  createClient?: CreateSftpClient;
  ssh2?: Partial<Ssh2RuntimeDependencies>;
}) {
  const { nodeStore, sftpStore } = dependencies;
  const ssh2Runtime: Ssh2RuntimeDependencies = {
    ...defaultSsh2RuntimeDependencies,
    ...dependencies.ssh2,
  };
  const createClient =
    dependencies.createClient ??
    ((node: StoredNodeWithSecrets, options: SftpClientCreationOptions) =>
      createSsh2SftpClient(node, options, ssh2Runtime));
  const activeConnections = new Map<string, SftpConnectionClient>();
  const connectionGenerations = new Map<string, number>();
  type PendingConnectionEntry = {
    generation: number;
    promise: Promise<SftpConnectionClient>;
  };
  const pendingConnections = new Map<string, PendingConnectionEntry>();

  const readGeneration = (nodeId: string) => connectionGenerations.get(nodeId) ?? 0;
  const bumpGeneration = (nodeId: string) => {
    connectionGenerations.set(nodeId, readGeneration(nodeId) + 1);
  };
  const clearPendingIfOwned = (nodeId: string, owner: PendingConnectionEntry) => {
    if (pendingConnections.get(nodeId) === owner) {
      pendingConnections.delete(nodeId);
    }
  };

  const createConnection = async (nodeId: string) => {
    const node = nodeStore.getNodeWithSecrets(nodeId);
    if (!node) {
      throw new Error('节点不存在。');
    }

    const existingHostKey = await sftpStore.getHostKey(node.id);
    let observedHostKey = false;

    const onHostKey = async (observation: HostKeyObservation) => {
      if (observedHostKey) {
        return;
      }
      observedHostKey = true;

      if (!existingHostKey) {
        await sftpStore.upsertHostKey({
          nodeId: node.id,
          algorithm: observation.algorithm,
          fingerprint: observation.fingerprint,
        });
        return;
      }

      if (existingHostKey.fingerprint !== observation.fingerprint) {
        throw new Error(`SFTP host key mismatch for node "${node.id}". Connection rejected.`);
      }
    };

    return createClient(node, { onHostKey });
  };

  return {
    async getOrCreate(nodeId: string) {
      const active = activeConnections.get(nodeId);
      if (active) {
        return active;
      }

      const generation = readGeneration(nodeId);
      const pending = pendingConnections.get(nodeId);
      if (pending) {
        return pending.promise;
      }

      const owner: PendingConnectionEntry = {
        generation,
        promise: Promise.resolve(null as unknown as SftpConnectionClient),
      };
      const creating = createConnection(nodeId)
        .then((connection) => {
          clearPendingIfOwned(nodeId, owner);
          if (readGeneration(nodeId) !== generation) {
            connection.end();
            return connection;
          }

          activeConnections.set(nodeId, connection);
          return connection;
        })
        .catch((error) => {
          clearPendingIfOwned(nodeId, owner);
          throw error;
        });
      owner.promise = creating;
      pendingConnections.set(nodeId, owner);
      return creating;
    },

    async closeNode(nodeId: string) {
      bumpGeneration(nodeId);
      const active = activeConnections.get(nodeId);
      if (active) {
        active.end();
      }
      activeConnections.delete(nodeId);
      pendingConnections.delete(nodeId);
    },

    async destroy(nodeId: string) {
      await this.closeNode(nodeId);
    },

    async destroyAll() {
      for (const nodeId of new Set<string>([
        ...activeConnections.keys(),
        ...pendingConnections.keys(),
      ])) {
        bumpGeneration(nodeId);
      }
      for (const connection of activeConnections.values()) {
        connection.end();
      }
      activeConnections.clear();
      pendingConnections.clear();
    },

    async listDirectory(nodeId: string, path: string) {
      const connection = await this.getOrCreate(nodeId);
      return connection.readDirectory(path);
    },

    async stat(nodeId: string, path: string) {
      const connection = await this.getOrCreate(nodeId);
      return connection.stat(path);
    },

    async mkdir(nodeId: string, path: string) {
      const connection = await this.getOrCreate(nodeId);
      await connection.mkdir(path);
    },

    async rename(nodeId: string, sourcePath: string, targetPath: string) {
      const connection = await this.getOrCreate(nodeId);
      await connection.rename(sourcePath, targetPath);
    },

    async unlink(nodeId: string, path: string) {
      const connection = await this.getOrCreate(nodeId);
      await connection.unlink(path);
    },

    async rmdir(nodeId: string, path: string) {
      const connection = await this.getOrCreate(nodeId);
      await connection.rmdir(path);
    },
  };
}
