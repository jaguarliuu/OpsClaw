import express, { type Express } from 'express';
import { registerAgentRoutes } from './http/agentRoutes.js';
import { registerCommandRoutes } from './http/commandRoutes.js';
import { registerGroupRoutes } from './http/groupRoutes.js';
import { registerLlmRoutes } from './http/llmRoutes.js';
import { registerMemoryRoutes } from './http/memoryRoutes.js';
import { registerNodeDashboardRoutes } from './http/nodeDashboardRoutes.js';
import { registerNodeRoutes } from './http/nodeRoutes.js';
import { registerScriptRoutes } from './http/scriptRoutes.js';
import type { HttpApiDependencies } from './http/support.js';

export function registerOpsClawHttpApi(app: Express, dependencies: HttpApiDependencies) {
  app.use((request, response, next) => {
    if (process.env.OPSCLAW_DESKTOP === '1') {
      const startedAt = Date.now();
      response.on('finish', () => {
        console.log('[OpsClawHttp]', {
          durationMs: Date.now() - startedAt,
          method: request.method,
          origin: request.headers.origin ?? null,
          statusCode: response.statusCode,
          url: request.url,
        });
      });
    }

    next();
  });

  app.use((request, response, next) => {
    const requestOrigin = request.headers.origin;
    const isDesktopRuntime = process.env.OPSCLAW_DESKTOP === '1';
    const allowOrigin =
      requestOrigin === 'http://localhost:5173'
        ? requestOrigin
        : isDesktopRuntime && requestOrigin === 'null'
          ? requestOrigin
          : undefined;

    if (allowOrigin) {
      response.header('Access-Control-Allow-Origin', allowOrigin);
      response.header('Vary', 'Origin');
    }

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

  registerNodeRoutes(app, dependencies);
  registerNodeDashboardRoutes(app, dependencies);
  registerGroupRoutes(app, dependencies);
  registerCommandRoutes(app, dependencies);
  registerLlmRoutes(app, dependencies);
  registerAgentRoutes(app, dependencies);
  registerMemoryRoutes(app, dependencies);
  registerScriptRoutes(app, dependencies);
}
