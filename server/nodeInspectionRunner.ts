import type { ConnectConfig } from 'ssh2';
import { Client } from 'ssh2';

import type { StoredNodeWithSecrets } from './nodeStore.js';

function buildConnectConfig(node: StoredNodeWithSecrets): ConnectConfig {
  const config: ConnectConfig = {
    host: node.host,
    port: node.port,
    username: node.username,
    readyTimeout: 20000,
    keepaliveInterval: 15000,
    keepaliveCountMax: 12,
    hostVerifier: () => true,
  };

  if (node.privateKey) {
    config.privateKey = node.privateKey;
    if (node.passphrase) {
      config.passphrase = node.passphrase;
    }
  } else if (node.password) {
    config.password = node.password;
  }

  return config;
}

function destroyClient(client: Client | null) {
  if (!client) {
    return;
  }

  client.removeAllListeners();
  client.end();
}

export function buildNodeInspectionExecRequest(command: string) {
  return {
    command: 'sh -s',
    stdin: command.endsWith('\n') ? command : `${command}\n`,
  };
}

function executeCommand(client: Client, command: string) {
  return new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error?: Error | null, output?: string) => {
      if (settled) {
        return;
      }

      settled = true;
      if (error) {
        reject(error);
        return;
      }

      resolve(output ?? '');
    };

    client.on('ready', () => {
      const request = buildNodeInspectionExecRequest(command);
      client.exec(request.command, (error, channel) => {
        if (error) {
          finish(error);
          return;
        }

        channel.end(request.stdin);

        channel.on('data', (chunk: Buffer | string) => {
          stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        });
        channel.stderr.on('data', (chunk: Buffer | string) => {
          stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        });
        channel.on('error', (channelError: Error) => {
          finish(channelError);
        });
        channel.on('close', (code: number | null) => {
          if (code !== null && code !== 0) {
            finish(new Error(stderr.trim() || `Inspection command exited with code ${code}.`));
            return;
          }

          finish(null, stdout);
        });
      });
    });

    client.on('error', (error) => {
      finish(error);
    });
  });
}

export async function runInspectionCommandOnNode(
  node: StoredNodeWithSecrets,
  command: string,
  getNodeWithSecrets: (id: string) => StoredNodeWithSecrets | null
) {
  const targetClient = new Client();
  let jumpClient: Client | null = null;

  try {
    if (!node.jumpHostId) {
      const outputPromise = executeCommand(targetClient, command);
      targetClient.connect(buildConnectConfig(node));
      return await outputPromise;
    }

    const jumpNode = getNodeWithSecrets(node.jumpHostId);
    if (!jumpNode) {
      throw new Error('跳板机节点不存在或已被删除。');
    }

    jumpClient = new Client();
    const outputPromise = new Promise<string>((resolve, reject) => {
      let settled = false;

      const finish = (error?: Error | null, output?: string) => {
        if (settled) {
          return;
        }

        settled = true;
        if (error) {
          reject(error);
          return;
        }

        resolve(output ?? '');
      };

      jumpClient!.on('ready', () => {
        jumpClient!.forwardOut('127.0.0.1', 0, node.host, node.port, (error, stream) => {
          if (error) {
            finish(new Error(`跳板机转发失败: ${error.message}`));
            return;
          }

          void executeCommand(targetClient, command)
            .then((output) => finish(null, output))
            .catch((execError: unknown) => {
              finish(execError instanceof Error ? execError : new Error(String(execError)));
            });

          targetClient.connect({
            ...buildConnectConfig(node),
            sock: stream,
          });
        });
      });

      jumpClient!.on('error', (error) => {
        finish(new Error(`跳板机连接失败: ${error.message}`));
      });
      targetClient.on('error', (error) => {
        finish(error);
      });
    });

    jumpClient.connect(buildConnectConfig(jumpNode));
    return await outputPromise;
  } finally {
    destroyClient(targetClient);
    destroyClient(jumpClient);
  }
}
