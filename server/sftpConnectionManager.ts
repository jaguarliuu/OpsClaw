import { createHash } from 'node:crypto';

import { Client, type ConnectConfig, type SFTPWrapper } from 'ssh2';

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
  options: SftpClientCreationOptions
) {
  return new Promise<SftpConnectionClient>((resolve, reject) => {
    const client = new Client();
    let settled = false;
    let hostKeyVerificationPromise: Promise<void> | null = null;

    const settleReject = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      client.end();
      reject(error);
    };

    client.on('error', (error) => {
      settleReject(error);
    });

    client.on('hostkeys', (hostKeys) => {
      const key = hostKeys[0];
      if (!Buffer.isBuffer(key)) {
        return;
      }

      hostKeyVerificationPromise = options.onHostKey({
        algorithm: 'sha256',
        fingerprint: toFingerprint(key),
      });
    });

    client.on('ready', () => {
      void (async () => {
        if (!hostKeyVerificationPromise) {
          settleReject(new Error(`SFTP host key was not provided for node "${node.id}".`));
          return;
        }

        try {
          await hostKeyVerificationPromise;
        } catch (error) {
          settleReject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

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
          resolve(wrapSftpClient(client, sftp));
        });
      })();
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
}) {
  const { nodeStore, sftpStore } = dependencies;
  const createClient = dependencies.createClient ?? createSsh2SftpClient;
  const activeConnections = new Map<string, SftpConnectionClient>();
  const pendingConnections = new Map<string, Promise<SftpConnectionClient>>();

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

      const pending = pendingConnections.get(nodeId);
      if (pending) {
        return pending;
      }

      const creating = createConnection(nodeId)
        .then((connection) => {
          activeConnections.set(nodeId, connection);
          pendingConnections.delete(nodeId);
          return connection;
        })
        .catch((error) => {
          pendingConnections.delete(nodeId);
          throw error;
        });
      pendingConnections.set(nodeId, creating);
      return creating;
    },

    async destroy(nodeId: string) {
      const active = activeConnections.get(nodeId);
      if (active) {
        active.end();
      }
      activeConnections.delete(nodeId);
      pendingConnections.delete(nodeId);
    },

    async destroyAll() {
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
