import {
  type HttpApiDependencies,
  type HttpRouteApp,
  RequestError,
  parseGroupInput,
} from './support.js';

export function registerGroupRoutes(app: HttpRouteApp, { nodeStore }: HttpApiDependencies) {
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
}
