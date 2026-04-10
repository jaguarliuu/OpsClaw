import * as net from 'node:net';

import { parseCSV } from '../csvParser.js';
import type { AuthMode, NodeInput } from '../nodeStore.js';
import {
  type HttpApiDependencies,
  type HttpRouteApp,
  RequestError,
  parseCsvImportInput,
  parseMoveNodeInput,
  parseNodeInput,
} from './support.js';

export function registerNodeRoutes(
  app: HttpRouteApp,
  { nodeStore, nodeInspectionService }: Pick<HttpApiDependencies, 'nodeStore' | 'nodeInspectionService'>
) {
  const rollbackCreatedNode = async (nodeId: string) => {
    await nodeStore.deleteNode(nodeId);
    await nodeInspectionService.deleteNodeInspectionData(nodeId);
  };

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
      const { csv: csvText } = parseCsvImportInput(request.body);

      const rows = parseCSV(csvText);
      if (rows.length < 2) {
        response.status(400).json({ message: 'CSV 至少需要包含标题行和一行数据。' });
        return;
      }

      const headers = rows[0].map((header) => header.trim());
      const results: Array<{ success: boolean; row: number; name?: string; error?: string }> = [];

      for (let index = 1; index < rows.length; index += 1) {
        const cells = rows[index];
        const rowData: Record<string, string> = {};
        headers.forEach((header, headerIndex) => {
          rowData[header] = cells[headerIndex]?.trim() || '';
        });

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
          if (Number.isNaN(input.port) || input.port < 1 || input.port > 65535) {
            throw new Error('端口无效');
          }
          if (input.authMode !== 'password' && input.authMode !== 'privateKey') {
            throw new Error('authMode 必须是 password 或 privateKey');
          }

          const createdNode = await nodeStore.createNode(input);
          if (!createdNode) {
            throw new Error('节点保存失败。');
          }
          try {
            await nodeInspectionService.ensureNodeBootstrap(createdNode.id);
          } catch (error) {
            await rollbackCreatedNode(createdNode.id);
            throw error;
          }
          results.push({ success: true, row: index + 1, name: createdNode.name });
        } catch (error) {
          results.push({
            success: false,
            row: index + 1,
            error: error instanceof Error ? error.message : '创建失败',
          });
        }
      }

      response.json({ results });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      console.error('[Import] error:', error);
      response.status(500).json({ message: 'CSV 导入失败。' });
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
      if (!node) {
        response.status(500).json({ message: '节点保存失败。' });
        return;
      }
      try {
        await nodeInspectionService.ensureNodeBootstrap(node.id);
      } catch (error) {
        await rollbackCreatedNode(node.id);
        throw error;
      }
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
      const node = await nodeStore.updateNode(
        request.params.id,
        parseNodeInput(request.body, { allowMissingSecret: true })
      );
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

      await nodeInspectionService.deleteNodeInspectionData(request.params.id);
      response.status(204).send();
    } catch (error) {
      console.error(error);
      response.status(500).json({ message: '节点删除失败。' });
    }
  });
}
