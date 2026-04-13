import { SftpServiceError } from '../sftpService.js';
import {
  type HttpApiDependencies,
  type HttpRouteApp,
  RequestError,
  isRecord,
  readRequiredString,
} from './support.js';

function readQueryPath(query: unknown) {
  if (!query || typeof query !== 'object') {
    return '.';
  }

  const value = (query as Record<string, unknown>).path;
  if (value === undefined || value === null) {
    return '.';
  }
  if (typeof value !== 'string') {
    throw new RequestError(400, '目录路径不能为空。');
  }

  const trimmed = value.trim();
  return trimmed || '.';
}

function handleSftpError(response: { status: (code: number) => { json: (payload: unknown) => void } }, error: unknown, fallbackMessage: string) {
  if (error instanceof RequestError || error instanceof SftpServiceError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }

  console.error('[SFTP] route error:', error);
  response.status(500).json({ message: fallbackMessage });
}

export function registerSftpRoutes(
  app: HttpRouteApp,
  { sftpService, sftpStore }: Pick<HttpApiDependencies, 'sftpService' | 'sftpStore'>
) {
  app.get('/api/nodes/:id/sftp/list', async (request, response) => {
    try {
      const result = await sftpService.listDirectory({
        nodeId: request.params.id,
        path: readQueryPath(request.query),
      });
      response.json(result);
    } catch (error) {
      handleSftpError(response, error, '读取 SFTP 目录失败。');
    }
  });

  app.post('/api/nodes/:id/sftp/directories', async (request, response) => {
    try {
      const body = isRecord(request.body) ? request.body : null;
      if (!body) {
        throw new RequestError(400, '目录创建请求格式错误。');
      }

      const result = await sftpService.createDirectory({
        nodeId: request.params.id,
        path: readRequiredString(body, 'path', '目录路径'),
      });
      response.status(201).json(result);
    } catch (error) {
      handleSftpError(response, error, '创建 SFTP 目录失败。');
    }
  });

  app.get('/api/nodes/:id/sftp/tasks', async (request, response) => {
    try {
      const items = await sftpStore.listResumableTasks(request.params.id);
      response.json({ items });
    } catch (error) {
      handleSftpError(response, error, '读取 SFTP 任务失败。');
    }
  });
}
