import {
  type HttpApiDependencies,
  type HttpRouteApp,
  RequestError,
  parseCreateScriptInput,
  parseUpdateScriptInput,
} from './support.js';

export function registerScriptRoutes(
  app: HttpRouteApp,
  { scriptLibraryStore }: Pick<HttpApiDependencies, 'scriptLibraryStore'>
) {
  app.get('/api/scripts/manage', (request, response) => {
    try {
      const scope = request.query['scope'];
      const nodeId =
        typeof request.query['nodeId'] === 'string' ? request.query['nodeId'] : undefined;

      response.json({
        items: scriptLibraryStore.listManagedScripts({
          scope: scope === 'global' || scope === 'node' ? scope : undefined,
          nodeId,
        }),
      });
    } catch (error) {
      console.error('[ScriptLibrary] manage list error:', error);
      response.status(500).json({ message: '脚本管理列表读取失败。' });
    }
  });

  app.get('/api/scripts', (request, response) => {
    try {
      const nodeId =
        typeof request.query['nodeId'] === 'string' ? request.query['nodeId'] : undefined;
      response.json({ items: scriptLibraryStore.listResolvedScripts(nodeId) });
    } catch (error) {
      console.error('[ScriptLibrary] list error:', error);
      response.status(500).json({ message: '脚本列表读取失败。' });
    }
  });

  app.post('/api/scripts', (request, response) => {
    try {
      const item = scriptLibraryStore.createScript(parseCreateScriptInput(request.body));
      response.status(201).json({ item });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      if (error instanceof Error) {
        response.status(400).json({ message: error.message });
        return;
      }

      console.error('[ScriptLibrary] create error:', error);
      response.status(500).json({ message: '脚本创建失败。' });
    }
  });

  app.put('/api/scripts/:id', (request, response) => {
    try {
      const item = scriptLibraryStore.updateScript(
        request.params.id,
        parseUpdateScriptInput(request.body)
      );
      if (!item) {
        response.status(404).json({ message: '脚本不存在。' });
        return;
      }

      response.json({ item });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      if (error instanceof Error) {
        response.status(400).json({ message: error.message });
        return;
      }

      console.error('[ScriptLibrary] update error:', error);
      response.status(500).json({ message: '脚本更新失败。' });
    }
  });

  app.delete('/api/scripts/:id', (request, response) => {
    try {
      scriptLibraryStore.deleteScript(request.params.id);
      response.sendStatus(204);
    } catch (error) {
      console.error('[ScriptLibrary] delete error:', error);
      response.status(500).json({ message: '脚本删除失败。' });
    }
  });
}
