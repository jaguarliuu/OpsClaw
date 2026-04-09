import type http from 'node:http';

import type { ClientChannel, ConnectConfig } from 'ssh2';
import { Client } from 'ssh2';
import { WebSocket, type WebSocketServer } from 'ws';

import { SessionRegistry } from './agent/sessionRegistry.js';
import { probeSessionSystemInfo } from './sessionSystemInfoProbe.js';

function logTerminalGateway(event: string, details: Record<string, unknown> = {}) {
  console.log(`[TerminalGateway] ${new Date().toISOString()} ${event}`, details);
}

type ClientMessage =
  | {
      type: 'connect';
      payload: {
        sessionId: string;
        nodeId?: string;
        host: string;
        port: number;
        username: string;
        password?: string;
        privateKey?: string;
        passphrase?: string;
        cols?: number;
        rows?: number;
      };
    }
  | {
      type: 'input';
      payload: string;
    }
  | {
      type: 'resize';
      payload: {
        cols: number;
        rows: number;
      };
    };

type ServerMessage =
  | { type: 'status'; payload: { state: 'connecting' | 'connected' | 'closed' } }
  | { type: 'data'; payload: string }
  | { type: 'error'; payload: { message: string } };

type SecretNode = {
  id: string;
  jumpHostId: string | null;
  host: string;
  port: number;
  username: string;
  password: string | null;
  privateKey: string | null;
  passphrase: string | null;
};

type NodeSecretsStore = {
  getNodeWithSecrets: (id: string) => SecretNode | null;
};

type RegisterTerminalGatewayOptions = {
  server: http.Server;
  websocketServer: WebSocketServer;
  nodeStore: NodeSecretsStore;
  sessionRegistry: SessionRegistry;
};

export function registerTerminalGateway({
  server,
  websocketServer,
  nodeStore,
  sessionRegistry,
}: RegisterTerminalGatewayOptions) {
  server.on('upgrade', (request, socket, head) => {
    if (!request.url?.startsWith('/ws/terminal')) {
      socket.destroy();
      return;
    }

    logTerminalGateway('upgrade:accepted', {
      url: request.url,
    });

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request);
    });
  });

  websocketServer.on('connection', (websocket, request) => {
    logTerminalGateway('ws:connection', {
      url: request?.url,
    });
    let sshClient: Client | null = null;
    let jumpSshClient: Client | null = null;
    let shellChannel: ClientChannel | null = null;
    let currentSessionId: string | null = null;
    let pendingTerminalData = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let websocketAlive = true;
    let systemInfoProbeStarted = false;
    const websocketHeartbeatTimer = setInterval(() => {
      if (websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (!websocketAlive) {
        websocket.terminate();
        return;
      }

      websocketAlive = false;
      websocket.ping();
    }, 30000);

    const send = (message: ServerMessage) => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(message));
      }
    };

    const flushTerminalData = () => {
      if (!pendingTerminalData) {
        flushTimer = null;
        return;
      }

      send({ type: 'data', payload: pendingTerminalData });
      pendingTerminalData = '';
      flushTimer = null;
    };

    const queueTerminalData = (chunk: string) => {
      pendingTerminalData += chunk;

      if (flushTimer !== null) {
        return;
      }

      const delay = pendingTerminalData.length < 10 ? 0 : 8;
      flushTimer = setTimeout(flushTerminalData, delay);
    };

    const probeAndCacheSessionSystemInfo = async (client: Client, sessionId: string) => {
      if (systemInfoProbeStarted) {
        return;
      }

      systemInfoProbeStarted = true;

      try {
        const systemInfo = await probeSessionSystemInfo(client);
        sessionRegistry.updateSessionSystemInfo(sessionId, systemInfo);
        logTerminalGateway('session:system_info_ready', {
          sessionId,
          systemInfo,
        });
      } catch (error) {
        logTerminalGateway('session:system_info_failed', {
          sessionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const cleanup = () => {
      logTerminalGateway('cleanup:start', {
        sessionId: currentSessionId,
        hasShellChannel: shellChannel !== null,
        hasSshClient: sshClient !== null,
        hasJumpSshClient: jumpSshClient !== null,
      });
      if (currentSessionId) {
        sessionRegistry.unregisterSession(currentSessionId);
      }

      clearInterval(websocketHeartbeatTimer);
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      pendingTerminalData = '';
      systemInfoProbeStarted = false;
      shellChannel?.removeAllListeners();
      shellChannel?.close();
      shellChannel = null;

      sshClient?.removeAllListeners();
      sshClient?.end();
      sshClient = null;

      jumpSshClient?.removeAllListeners();
      jumpSshClient?.end();
      jumpSshClient = null;
      logTerminalGateway('cleanup:done', {
        sessionId: currentSessionId,
      });
    };

    websocket.on('pong', () => {
      websocketAlive = true;
    });

    websocket.on('message', (rawMessage) => {
      let message: ClientMessage;

      try {
        const payload =
          typeof rawMessage === 'string'
            ? rawMessage
            : Buffer.isBuffer(rawMessage)
              ? rawMessage.toString('utf8')
              : Array.isArray(rawMessage)
                ? Buffer.concat(rawMessage).toString('utf8')
                : Buffer.from(rawMessage).toString('utf8');
        message = JSON.parse(payload) as ClientMessage;
      } catch {
        send({ type: 'error', payload: { message: 'Invalid terminal message payload.' } });
        return;
      }

      if (message.type === 'connect') {
        const connectPayload = message.payload;
        logTerminalGateway('connect:received', {
          sessionId: connectPayload.sessionId,
          nodeId: connectPayload.nodeId,
          host: connectPayload.host,
          port: connectPayload.port,
          username: connectPayload.username,
          hasPassword: Boolean(connectPayload.password),
          hasPrivateKey: Boolean(connectPayload.privateKey),
          hasPassphrase: Boolean(connectPayload.passphrase),
          cols: connectPayload.cols,
          rows: connectPayload.rows,
        });
        cleanup();
        send({ type: 'status', payload: { state: 'connecting' } });
        currentSessionId = connectPayload.sessionId;
        sessionRegistry.registerSession({
          sessionId: connectPayload.sessionId,
          nodeId: connectPayload.nodeId,
          host: connectPayload.host,
          port: connectPayload.port,
          username: connectPayload.username,
          sendInput: (payload) => {
            if (shellChannel) {
              shellChannel.write(payload);
            }
          },
        });
        sessionRegistry.updateSessionStatus(connectPayload.sessionId, 'connecting');

        const ssh = new Client();
        sshClient = ssh;

        ssh.on('ready', () => {
          logTerminalGateway('ssh:ready', {
            sessionId: connectPayload.sessionId,
          });
          const ptyOptions = {
            term: 'xterm-256color',
            cols: connectPayload.cols ?? 120,
            rows: connectPayload.rows ?? 32,
          };

          ssh.shell(ptyOptions, (error, channel) => {
            if (error) {
              console.error('[TerminalGateway] ssh:shell_error', {
                sessionId: connectPayload.sessionId,
                message: error.message,
              });
              send({ type: 'error', payload: { message: error.message } });
              sessionRegistry.updateSessionStatus(connectPayload.sessionId, 'error', error.message);
              return;
            }

            shellChannel = channel;
            logTerminalGateway('ssh:shell_open', {
              sessionId: connectPayload.sessionId,
            });
            send({ type: 'status', payload: { state: 'connected' } });
            sessionRegistry.updateSessionStatus(connectPayload.sessionId, 'connected');
            void probeAndCacheSessionSystemInfo(ssh, connectPayload.sessionId);

            channel.on('data', (chunk: Buffer) => {
              const content = chunk.toString('utf8');
              sessionRegistry.appendTerminalData(connectPayload.sessionId, content);
              queueTerminalData(content);
            });

            channel.stderr.on('data', (chunk: Buffer) => {
              const content = chunk.toString('utf8');
              sessionRegistry.appendTerminalData(connectPayload.sessionId, content);
              queueTerminalData(content);
            });

            channel.on('close', () => {
              logTerminalGateway('ssh:shell_close', {
                sessionId: connectPayload.sessionId,
              });
              flushTerminalData();
              send({ type: 'status', payload: { state: 'closed' } });
              sessionRegistry.updateSessionStatus(connectPayload.sessionId, 'closed');
              cleanup();
            });
          });
        });

        ssh.on('error', (error) => {
          console.error('[TerminalGateway] ssh:error', {
            sessionId: connectPayload.sessionId,
            message: error.message,
          });
          send({ type: 'error', payload: { message: error.message } });
          sessionRegistry.updateSessionStatus(connectPayload.sessionId, 'error', error.message);
        });

        ssh.on('close', () => {
          logTerminalGateway('ssh:close', {
            sessionId: connectPayload.sessionId,
          });
          send({ type: 'status', payload: { state: 'closed' } });
          sessionRegistry.updateSessionStatus(connectPayload.sessionId, 'closed');
        });

        const config: ConnectConfig = {
          host: connectPayload.host,
          port: connectPayload.port,
          username: connectPayload.username,
          readyTimeout: 15000,
          keepaliveInterval: 15000,
          keepaliveCountMax: 12,
          hostVerifier: () => true,
        };

        if (connectPayload.nodeId) {
          const node = nodeStore.getNodeWithSecrets(connectPayload.nodeId);
          logTerminalGateway('node:lookup', {
            nodeId: connectPayload.nodeId,
            found: Boolean(node),
          });
          if (!node) {
            send({ type: 'error', payload: { message: '节点不存在或已被删除。' } });
            cleanup();
            return;
          }

          config.host = node.host;
          config.port = node.port;
          config.username = node.username;

          if (node.privateKey) {
            config.privateKey = node.privateKey;
            if (node.passphrase) {
              config.passphrase = node.passphrase;
            }
          } else if (node.password) {
            config.password = node.password;
          }

          if (node.jumpHostId) {
            const jumpNode = nodeStore.getNodeWithSecrets(node.jumpHostId);
            logTerminalGateway('jump_node:lookup', {
              jumpHostId: node.jumpHostId,
              found: Boolean(jumpNode),
            });
            if (!jumpNode) {
              send({ type: 'error', payload: { message: '跳板机节点不存在或已被删除。' } });
              cleanup();
              return;
            }

            const jumpConfig: ConnectConfig = {
              host: jumpNode.host,
              port: jumpNode.port,
              username: jumpNode.username,
              readyTimeout: 20000,
              keepaliveInterval: 15000,
              keepaliveCountMax: 12,
              hostVerifier: () => true,
            };

            if (jumpNode.privateKey) {
              jumpConfig.privateKey = jumpNode.privateKey;
              if (jumpNode.passphrase) {
                jumpConfig.passphrase = jumpNode.passphrase;
              }
            } else if (jumpNode.password) {
              jumpConfig.password = jumpNode.password;
            }

            const jump = new Client();
            jumpSshClient = jump;

            jump.on('ready', () => {
              logTerminalGateway('jump_ssh:ready', {
                sessionId: connectPayload.sessionId,
                jumpHostId: node.jumpHostId,
              });
              jump.forwardOut('127.0.0.1', 0, node.host, node.port, (error, stream) => {
                if (error) {
                  console.error('[TerminalGateway] jump_ssh:forward_error', {
                    sessionId: connectPayload.sessionId,
                    message: error.message,
                  });
                  send({ type: 'error', payload: { message: `跳板机转发失败: ${error.message}` } });
                  cleanup();
                  return;
                }

                logTerminalGateway('jump_ssh:forward_ready', {
                  sessionId: connectPayload.sessionId,
                  targetHost: node.host,
                  targetPort: node.port,
                });
                ssh.connect({ ...config, sock: stream });
              });
            });

            jump.on('error', (error) => {
              console.error('[TerminalGateway] jump_ssh:error', {
                sessionId: connectPayload.sessionId,
                message: error.message,
              });
              send({ type: 'error', payload: { message: `跳板机连接失败: ${error.message}` } });
              cleanup();
            });

            logTerminalGateway('jump_ssh:connect', {
              sessionId: connectPayload.sessionId,
              host: jumpNode.host,
              port: jumpNode.port,
              username: jumpNode.username,
              hasPassword: Boolean(jumpNode.password),
              hasPrivateKey: Boolean(jumpNode.privateKey),
              hasPassphrase: Boolean(jumpNode.passphrase),
            });
            jump.connect(jumpConfig);
            return;
          }
        }

        if (!connectPayload.nodeId && connectPayload.privateKey) {
          config.privateKey = connectPayload.privateKey;
          if (connectPayload.passphrase) {
            config.passphrase = connectPayload.passphrase;
          }
        } else if (!connectPayload.nodeId && connectPayload.password) {
          config.password = connectPayload.password;
        }

        logTerminalGateway('ssh:connect', {
          sessionId: connectPayload.sessionId,
          host: config.host,
          port: config.port,
          username: config.username,
          hasPassword: 'password' in config && Boolean(config.password),
          hasPrivateKey: 'privateKey' in config && Boolean(config.privateKey),
          hasPassphrase: 'passphrase' in config && Boolean(config.passphrase),
          viaJumpHost: Boolean(connectPayload.nodeId && sshClient && jumpSshClient),
        });
        ssh.connect(config);
        return;
      }

      if (message.type === 'input') {
        if (currentSessionId) {
          sessionRegistry.noteUserInput(currentSessionId, message.payload);
        }
        shellChannel?.write(message.payload);
        return;
      }

      if (message.type === 'resize') {
        shellChannel?.setWindow(message.payload.rows, message.payload.cols, 0, 0);
      }
    });

    websocket.on('close', () => {
      logTerminalGateway('ws:close', {
        sessionId: currentSessionId,
      });
      cleanup();
    });
    websocket.on('error', (error) => {
      console.error('[TerminalGateway] ws:error', {
        sessionId: currentSessionId,
        message: error instanceof Error ? error.message : String(error),
      });
      cleanup();
    });
  });
}
