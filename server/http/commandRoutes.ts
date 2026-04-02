import { type HttpApiDependencies, type HttpRouteApp } from './support.js';

export function registerCommandRoutes(
  app: HttpRouteApp,
  { commandHistoryStore }: HttpApiDependencies
) {
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
      const nodeId =
        typeof request.query['nodeId'] === 'string' ? request.query['nodeId'] : undefined;
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
}
