import {
  type HttpApiDependencies,
  type HttpRouteApp,
  RequestError,
  isRecord,
  readRequiredString,
} from './support.js';

export function registerMemoryRoutes(
  app: HttpRouteApp,
  { nodeStore, fileMemoryStore }: Pick<HttpApiDependencies, 'nodeStore' | 'fileMemoryStore'>
) {
  app.get('/api/memory/global', async (_request, response) => {
    try {
      const item = await fileMemoryStore.readGlobalMemory();
      response.json({ item });
    } catch (error) {
      console.error('[Memory] read global error:', error);
      response.status(500).json({ message: '全局记忆读取失败。' });
    }
  });

  app.put('/api/memory/global', async (request, response) => {
    try {
      const body = isRecord(request.body) ? request.body : null;
      const content = body
        ? readRequiredString(body, 'content', '记忆内容', { allowEmpty: true })
        : '';
      const item = await fileMemoryStore.writeGlobalMemory(content);
      response.json({ item });
    } catch (error) {
      console.error('[Memory] write global error:', error);
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      response.status(500).json({ message: '全局记忆保存失败。' });
    }
  });

  app.get('/api/memory/groups/:id', async (request, response) => {
    try {
      const group = nodeStore.getGroup(request.params.id);
      if (!group) {
        response.status(404).json({ message: '分组不存在。' });
        return;
      }

      const item = await fileMemoryStore.readGroupMemory(group.id, group.name);
      response.json({ item });
    } catch (error) {
      console.error('[Memory] read group error:', error);
      response.status(500).json({ message: '分组记忆读取失败。' });
    }
  });

  app.put('/api/memory/groups/:id', async (request, response) => {
    try {
      const group = nodeStore.getGroup(request.params.id);
      if (!group) {
        response.status(404).json({ message: '分组不存在。' });
        return;
      }

      const body = isRecord(request.body) ? request.body : null;
      const content = body
        ? readRequiredString(body, 'content', '记忆内容', { allowEmpty: true })
        : '';
      const item = await fileMemoryStore.writeGroupMemory(group.id, group.name, content);
      response.json({ item });
    } catch (error) {
      console.error('[Memory] write group error:', error);
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      response.status(500).json({ message: '分组记忆保存失败。' });
    }
  });

  app.get('/api/memory/nodes/:id', async (request, response) => {
    try {
      const node = nodeStore.getNode(request.params.id);
      if (!node) {
        response.status(404).json({ message: '节点不存在。' });
        return;
      }

      const item = await fileMemoryStore.readNodeMemory(node.id, node.name);
      response.json({ item });
    } catch (error) {
      console.error('[Memory] read node error:', error);
      response.status(500).json({ message: '节点记忆读取失败。' });
    }
  });

  app.put('/api/memory/nodes/:id', async (request, response) => {
    try {
      const node = nodeStore.getNode(request.params.id);
      if (!node) {
        response.status(404).json({ message: '节点不存在。' });
        return;
      }

      const body = isRecord(request.body) ? request.body : null;
      const content = body
        ? readRequiredString(body, 'content', '记忆内容', { allowEmpty: true })
        : '';
      const item = await fileMemoryStore.writeNodeMemory(node.id, node.name, content);
      response.json({ item });
    } catch (error) {
      console.error('[Memory] write node error:', error);
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      response.status(500).json({ message: '节点记忆保存失败。' });
    }
  });
}
