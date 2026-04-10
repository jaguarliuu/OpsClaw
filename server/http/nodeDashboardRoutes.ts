import { NodeInspectionServiceError } from '../nodeInspectionService.js';
import { type HttpApiDependencies, type HttpRouteApp } from './support.js';

export function registerNodeDashboardRoutes(
  app: HttpRouteApp,
  { nodeInspectionService }: Pick<HttpApiDependencies, 'nodeInspectionService'>
) {
  app.get('/api/nodes/:id/dashboard', async (request, response) => {
    try {
      response.json(await nodeInspectionService.getNodeDashboard(request.params.id));
    } catch (error) {
      if (error instanceof NodeInspectionServiceError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      console.error('[NodeDashboard] get error:', error);
      response.status(500).json({ message: '节点 dashboard 读取失败。' });
    }
  });

  app.post('/api/nodes/:id/dashboard/collect', async (request, response) => {
    try {
      response.json(await nodeInspectionService.collectNodeDashboard(request.params.id));
    } catch (error) {
      if (error instanceof NodeInspectionServiceError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      console.error('[NodeDashboard] collect error:', error);
      response.status(500).json({ message: '节点 dashboard 采集失败。' });
    }
  });
}
