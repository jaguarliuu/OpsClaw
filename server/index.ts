import http from 'node:http';
import * as net from 'node:net';

import express from 'express';
import type { ClientChannel, ConnectConfig } from 'ssh2';
import { Client } from 'ssh2';
import { WebSocket, WebSocketServer } from 'ws';

import { createCommandHistoryStore } from './commandHistoryStore.js';
import { createLlmProviderStore } from './llmProviderStore.js';
import { streamChat } from './llmClient.js';
import { createNodeStore, type AuthMode, type NodeInput } from './nodeStore.js';
import { parseCSV } from './csvParser.js';

type ClientMessage =
  | {
      type: 'connect';
      payload: {
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

class RequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRequiredString(
  body: Record<string, unknown>,
  key: string,
  label: string,
  options?: { allowEmpty?: boolean }
) {
  const value = body[key];
  if (typeof value !== 'string') {
    throw new RequestError(400, `${label}不能为空。`);
  }

  const trimmed = value.trim();
  if (!options?.allowEmpty && !trimmed) {
    throw new RequestError(400, `${label}不能为空。`);
  }

  return trimmed;
}

function readOptionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new RequestError(400, `${key}格式错误。`);
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function readPort(body: Record<string, unknown>) {
  const value = body.port;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RequestError(400, '端口必须是整数。');
  }

  if (value < 1 || value > 65535) {
    throw new RequestError(400, '端口必须在 1 到 65535 之间。');
  }

  return value;
}

function readAuthMode(body: Record<string, unknown>): AuthMode {
  const authMode = body.authMode;
  if (authMode !== 'password' && authMode !== 'privateKey') {
    throw new RequestError(400, '验证方式不正确。');
  }

  return authMode;
}

function parseNodeInput(payload: unknown): NodeInput {
  if (!isRecord(payload)) {
    throw new RequestError(400, '节点配置格式错误。');
  }

  const host = readRequiredString(payload, 'host', '主机地址');
  const authMode = readAuthMode(payload);
  const password = readOptionalString(payload, 'password');
  const privateKey = readOptionalString(payload, 'privateKey');
  const passphrase = readOptionalString(payload, 'passphrase');

  if (authMode === 'password' && !password) {
    throw new RequestError(400, '密码验证必须提供密码。');
  }

  if (authMode === 'privateKey' && !privateKey) {
    throw new RequestError(400, '密钥验证必须提供私钥。');
  }

  return {
    name: readOptionalString(payload, 'name') ?? host,
    groupId: readOptionalString(payload, 'groupId'),
    groupName: readOptionalString(payload, 'groupName') ?? '默认',
    jumpHostId: readOptionalString(payload, 'jumpHostId'),
    host,
    port: readPort(payload),
    username: readRequiredString(payload, 'username', '用户名'),
    authMode,
    password,
    privateKey,
    passphrase,
    note: readOptionalString(payload, 'note') ?? '',
  };
}

function parseGroupInput(payload: unknown) {
  if (!isRecord(payload)) {
    throw new RequestError(400, '分组配置格式错误。');
  }

  return {
    name: readRequiredString(payload, 'name', '分组名称'),
  };
}

function parseMoveNodeInput(payload: unknown) {
  if (!isRecord(payload)) {
    throw new RequestError(400, '节点分组配置格式错误。');
  }

  return {
    groupId: readRequiredString(payload, 'groupId', '目标分组'),
  };
}

async function startServer() {
  const nodeStore = await createNodeStore();
  const commandHistoryStore = await createCommandHistoryStore();
  const llmProviderStore = await createLlmProviderStore();
  const app = express();
  const server = http.createServer(app);
  const websocketServer = new WebSocketServer({ noServer: true });
  const port = Number(process.env.PORT ?? 4000);

  app.use((request, response, next) => {
    response.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    response.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    response.header('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  app.get('/api/nodes', (_request, response) => {
    response.json({ items: nodeStore.listNodes() });
  });

  app.get('/api/nodes/ping-all', async (_request, response) => {
    const nodes = nodeStore.listNodes();
    const results: Record<string, { online: boolean; latencyMs?: number }> = {};

    await Promise.all(
      nodes.map(
        (node) =>
          new Promise<void>((resolve) => {
            const socket = new net.Socket();
            const start = Date.now();
            socket.setTimeout(3000);
            socket.connect(node.port, node.host, () => {
              results[node.id] = { online: true, latencyMs: Date.now() - start };
              socket.destroy();
              resolve();
            });
            socket.on('error', () => {
              results[node.id] = { online: false };
              resolve();
            });
            socket.on('timeout', () => {
              results[node.id] = { online: false };
              socket.destroy();
              resolve();
            });
          })
      )
    );

    response.json(results);
  });

  app.post('/api/nodes/import', async (request, response) => {
    try {
      const csvText = request.body.csv;
      if (typeof csvText !== 'string' || !csvText.trim()) {
        response.status(400).json({ message: 'CSV 内容不能为空。' });
        return;
      }

      const rows = parseCSV(csvText);
      if (rows.length < 2) {
        response.status(400).json({ message: 'CSV 至少需要包含标题行和一行数据。' });
        return;
      }

      const headers = rows[0].map(h => h.trim());
      const results: Array<{ success: boolean; row: number; name?: string; error?: string }> = [];

      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i];
        const rowData: Record<string, string> = {};
        headers.forEach((h, idx) => { rowData[h] = cells[idx]?.trim() || ''; });

        try {
          const input: NodeInput = {
            name: rowData.name || rowData.host,
            host: rowData.host,
            port: parseInt(rowData.port, 10),
            username: rowData.username,
            authMode: rowData.authMode as AuthMode,
            password: rowData.password || undefined,
            privateKey: rowData.privateKey || undefined,
            passphrase: rowData.passphrase || undefined,
            groupName: rowData.groupName || undefined,
            jumpHostId: rowData.jumpHostId || undefined,
          };

          if (!input.host || !input.username || !input.authMode) {
            throw new Error('缺少必填字段：host, username, authMode');
          }
          if (isNaN(input.port) || input.port < 1 || input.port > 65535) {
            throw new Error('端口无效');
          }
          if (input.authMode !== 'password' && input.authMode !== 'privateKey') {
            throw new Error('authMode 必须是 password 或 privateKey');
          }

          await nodeStore.createNode(input);
          results.push({ success: true, row: i + 1, name: input.name });
        } catch (error) {
          results.push({
            success: false,
            row: i + 1,
            error: error instanceof Error ? error.message : '创建失败',
          });
        }
      }

      response.json({ results });
    } catch (error) {
      console.error('[Import] error:', error);
      response.status(500).json({ message: 'CSV 导入失败。' });
    }
  });

  app.get('/api/groups', (_request, response) => {
    response.json({ items: nodeStore.listGroups() });
  });

  app.post('/api/groups', (request, response) => {
    try {
      const group = nodeStore.createGroup(parseGroupInput(request.body).name);
      response.status(201).json({ item: group });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      response.status(400).json({
        message: error instanceof Error ? error.message : '分组创建失败。',
      });
    }
  });

  app.put('/api/groups/:id', async (request, response) => {
    try {
      const group = await nodeStore.renameGroup(
        request.params.id,
        parseGroupInput(request.body).name
      );

      if (!group) {
        response.status(404).json({ message: '分组不存在。' });
        return;
      }

      response.json({ item: group });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      response.status(400).json({
        message: error instanceof Error ? error.message : '分组更新失败。',
      });
    }
  });

  app.delete('/api/groups/:id', async (request, response) => {
    try {
      const deleted = await nodeStore.deleteGroup(request.params.id);
      if (!deleted) {
        response.status(404).json({ message: '分组不存在。' });
        return;
      }

      response.status(204).send();
    } catch (error) {
      response.status(400).json({
        message: error instanceof Error ? error.message : '分组删除失败。',
      });
    }
  });

  // Command history routes — before /api/nodes/:id to avoid param conflicts
  app.post('/api/commands', (request, response) => {
    try {
      const { command, nodeId } = request.body as { command?: unknown; nodeId?: unknown };
      if (typeof command !== 'string' || !command.trim()) {
        response.status(400).json({ message: '命令不能为空。' });
        return;
      }
      const item = commandHistoryStore.upsertCommand(
        command.trim(),
        typeof nodeId === 'string' ? nodeId : null
      );
      response.status(201).json({ item });
    } catch (error) {
      console.error('[CommandHistory] upsert error:', error);
      response.status(500).json({ message: '命令记录失败。' });
    }
  });

  app.get('/api/commands/search', (request, response) => {
    try {
      const q = typeof request.query['q'] === 'string' ? request.query['q'] : '';
      const nodeId = typeof request.query['nodeId'] === 'string' ? request.query['nodeId'] : undefined;
      const items = commandHistoryStore.searchCommands(q, nodeId);
      response.json({ items });
    } catch (error) {
      console.error('[CommandHistory] search error:', error);
      response.status(500).json({ message: '命令搜索失败。' });
    }
  });

  app.delete('/api/commands/:id', (request, response) => {
    try {
      commandHistoryStore.deleteCommand(request.params.id);
      response.sendStatus(204);
    } catch (error) {
      console.error('[CommandHistory] delete error:', error);
      response.status(500).json({ message: '命令删除失败。' });
    }
  });

  // LLM Provider routes
  app.get('/api/llm/providers', (_request, response) => {
    try {
      const providers = llmProviderStore.listProviders();
      response.json({ items: providers });
    } catch (error) {
      console.error('[LLM] list providers error:', error);
      response.status(500).json({ message: 'LLM 配置读取失败。' });
    }
  });

  app.post('/api/llm/providers', (request, response) => {
    try {
      const { name, providerType, baseUrl, apiKey, model, maxTokens, temperature } = request.body;
      const provider = llmProviderStore.createProvider({
        name,
        providerType,
        baseUrl,
        apiKey,
        model,
        maxTokens,
        temperature,
      });
      response.status(201).json({ item: provider });
    } catch (error) {
      console.error('[LLM] create provider error:', error);
      response.status(500).json({ message: 'LLM 配置创建失败。' });
    }
  });

  app.put('/api/llm/providers/:id', (request, response) => {
    try {
      const provider = llmProviderStore.updateProvider(request.params.id, request.body);
      if (!provider) {
        response.status(404).json({ message: 'LLM 配置不存在。' });
        return;
      }
      response.json({ item: provider });
    } catch (error) {
      console.error('[LLM] update provider error:', error);
      response.status(500).json({ message: 'LLM 配置更新失败。' });
    }
  });

  app.delete('/api/llm/providers/:id', (request, response) => {
    try {
      llmProviderStore.deleteProvider(request.params.id);
      response.sendStatus(204);
    } catch (error) {
      console.error('[LLM] delete provider error:', error);
      response.status(500).json({ message: 'LLM 配置删除失败。' });
    }
  });

  app.put('/api/llm/providers/:id/default', (request, response) => {
    try {
      llmProviderStore.setDefaultProvider(request.params.id);
      response.sendStatus(204);
    } catch (error) {
      console.error('[LLM] set default provider error:', error);
      response.status(500).json({ message: '设置默认 LLM 失败。' });
    }
  });

  app.post('/api/llm/chat', async (request, response) => {
    try {
      const { providerId, messages } = request.body;
      const provider = llmProviderStore.getProvider(providerId);
      
      if (!provider) {
        response.status(404).json({ message: 'LLM 配置不存在。' });
        return;
      }

      if (!provider.enabled) {
        response.status(400).json({ message: 'LLM 配置已禁用。' });
        return;
      }

      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Cache-Control', 'no-cache');
      response.setHeader('Connection', 'keep-alive');

      for await (const chunk of streamChat(provider, messages)) {
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      response.end();
    } catch (error) {
      console.error('[LLM] chat error:', error);
      if (!response.headersSent) {
        response.status(500).json({ message: 'AI 对话失败。' });
      }
    }
  });

  app.get('/api/nodes/:id', (request, response) => {
    try {
      const node = nodeStore.getNode(request.params.id);
      if (!node) {
        response.status(404).json({ message: '节点不存在。' });
        return;
      }

      response.json({ item: node });
    } catch (error) {
      console.error(error);
      response.status(500).json({ message: '节点读取失败。' });
    }
  });

  app.post('/api/nodes', async (request, response) => {
    try {
      const node = await nodeStore.createNode(parseNodeInput(request.body));
      response.status(201).json({ item: node });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      console.error(error);
      response.status(500).json({ message: '节点保存失败。' });
    }
  });

  app.put('/api/nodes/:id', async (request, response) => {
    try {
      const node = await nodeStore.updateNode(request.params.id, parseNodeInput(request.body));
      if (!node) {
        response.status(404).json({ message: '节点不存在。' });
        return;
      }

      response.json({ item: node });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      console.error(error);
      response.status(500).json({ message: '节点更新失败。' });
    }
  });

  app.put('/api/nodes/:id/group', async (request, response) => {
    try {
      const node = await nodeStore.moveNodeToGroup(
        request.params.id,
        parseMoveNodeInput(request.body).groupId
      );

      if (!node) {
        response.status(404).json({ message: '节点或分组不存在。' });
        return;
      }

      response.json({ item: node });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      console.error(error);
      response.status(500).json({ message: '节点移动失败。' });
    }
  });

  app.delete('/api/nodes/:id', async (request, response) => {
    try {
      const deleted = await nodeStore.deleteNode(request.params.id);
      if (!deleted) {
        response.status(404).json({ message: '节点不存在。' });
        return;
      }

      response.status(204).send();
    } catch (error) {
      console.error(error);
      response.status(500).json({ message: '节点删除失败。' });
    }
  });

  server.on('upgrade', (request, socket, head) => {
    if (!request.url?.startsWith('/ws/terminal')) {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit('connection', websocket, request);
    });
  });

  websocketServer.on('connection', (websocket) => {
    let sshClient: Client | null = null;
    let jumpSshClient: Client | null = null;
    let shellChannel: ClientChannel | null = null;
    let pendingTerminalData = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let websocketAlive = true;
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

      flushTimer = setTimeout(flushTerminalData, 8);
    };

    const cleanup = () => {
      clearInterval(websocketHeartbeatTimer);
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      pendingTerminalData = '';
      shellChannel?.removeAllListeners();
      shellChannel?.close();
      shellChannel = null;

      sshClient?.removeAllListeners();
      sshClient?.end();
      sshClient = null;

      jumpSshClient?.removeAllListeners();
      jumpSshClient?.end();
      jumpSshClient = null;
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
        cleanup();
        send({ type: 'status', payload: { state: 'connecting' } });

        const ssh = new Client();
        sshClient = ssh;

      ssh.on('ready', () => {
        const ptyOptions = {
          term: 'xterm-256color',
          cols: message.payload.cols ?? 120,
          rows: message.payload.rows ?? 32,
        };

        ssh.shell(ptyOptions, (error, channel) => {
          if (error) {
            send({ type: 'error', payload: { message: error.message } });
            return;
          }

          shellChannel = channel;
          send({ type: 'status', payload: { state: 'connected' } });

          channel.on('data', (chunk: Buffer) => {
            queueTerminalData(chunk.toString('utf8'));
          });

          channel.stderr.on('data', (chunk: Buffer) => {
            queueTerminalData(chunk.toString('utf8'));
          });

          channel.on('close', () => {
            flushTerminalData();
            send({ type: 'status', payload: { state: 'closed' } });
            cleanup();
          });
        });
      });

        ssh.on('error', (error) => {
          send({ type: 'error', payload: { message: error.message } });
        });

        ssh.on('close', () => {
          send({ type: 'status', payload: { state: 'closed' } });
        });

        const config: ConnectConfig = {
          host: message.payload.host,
          port: message.payload.port,
          username: message.payload.username,
          readyTimeout: 15000,
          keepaliveInterval: 15000,
          keepaliveCountMax: 12,
          hostVerifier: () => true,
        };

        if (message.payload.nodeId) {
          const node = nodeStore.getNode(message.payload.nodeId);
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
            const jumpNode = nodeStore.getNode(node.jumpHostId);
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
              jump.forwardOut('127.0.0.1', 0, node.host, node.port, (err, stream) => {
                if (err) {
                  send({ type: 'error', payload: { message: `跳板机转发失败: ${err.message}` } });
                  cleanup();
                  return;
                }

                ssh.connect({ ...config, sock: stream });
              });
            });

            jump.on('error', (error) => {
              send({ type: 'error', payload: { message: `跳板机连接失败: ${error.message}` } });
              cleanup();
            });

            jump.connect(jumpConfig);
            return;
          }
        }

        if (!message.payload.nodeId && message.payload.privateKey) {
          config.privateKey = message.payload.privateKey;
          if (message.payload.passphrase) {
            config.passphrase = message.payload.passphrase;
          }
        } else if (!message.payload.nodeId && message.payload.password) {
          config.password = message.payload.password;
        }

        ssh.connect(config);
        return;
      }

      if (message.type === 'input') {
        shellChannel?.write(message.payload);
        return;
      }

      if (message.type === 'resize') {
        shellChannel?.setWindow(message.payload.rows, message.payload.cols, 0, 0);
      }
    });

    websocket.on('close', cleanup);
    websocket.on('error', cleanup);
  });

  server.listen(port, () => {
    console.log(`OpsClaw SSH gateway listening on http://localhost:${port}`);
  });
}

void startServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

