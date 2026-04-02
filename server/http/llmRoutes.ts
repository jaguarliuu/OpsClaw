import type { RequestHandler } from 'express';

import { streamChat } from '../llmClient.js';
import {
  type HttpApiDependencies,
  type HttpRouteApp,
  RequestError,
  parseCreateProviderInput,
  parseLlmChatInput,
  parseUpdateProviderInput,
} from './support.js';

type RegisterLlmRoutesDependencies = Pick<HttpApiDependencies, 'llmProviderStore'>;

type LlmChatStreamFn = typeof streamChat;

export function createLlmChatHandler(
  { llmProviderStore }: RegisterLlmRoutesDependencies,
  options?: {
    streamChatFn?: LlmChatStreamFn;
  }
) {
  const streamChatFn = options?.streamChatFn ?? streamChat;

  const handler: RequestHandler = async (request, response) => {
    try {
      const { providerId, model, messages } = parseLlmChatInput(request.body);
      const provider = llmProviderStore.getProviderWithApiKey(providerId);

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
      response.flushHeaders?.();

      const abortController = new AbortController();
      let finished = false;

      request.on('aborted', () => {
        if (!finished) {
          abortController.abort();
        }
      });

      response.on('close', () => {
        if (!finished) {
          abortController.abort();
        }
      });

      try {
        for await (const chunk of streamChatFn(provider, model, messages, abortController.signal)) {
          response.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      } finally {
        finished = true;
        response.end();
      }
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      console.error('[LLM] chat error:', error);
      if (!response.headersSent) {
        response.status(500).json({ message: 'AI 对话失败。' });
      }
    }
  };

  return handler;
}

export function registerLlmRoutes(app: HttpRouteApp, { llmProviderStore }: HttpApiDependencies) {
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
      const provider = llmProviderStore.createProvider(parseCreateProviderInput(request.body));
      response.status(201).json({ item: provider });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      console.error('[LLM] create provider error:', error);
      response.status(500).json({ message: 'LLM 配置创建失败。' });
    }
  });

  app.put('/api/llm/providers/:id', (request, response) => {
    try {
      const provider = llmProviderStore.updateProvider(
        request.params.id,
        parseUpdateProviderInput(request.body)
      );
      if (!provider) {
        response.status(404).json({ message: 'LLM 配置不存在。' });
        return;
      }
      response.json({ item: provider });
    } catch (error) {
      if (error instanceof RequestError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

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
      if (error instanceof Error && error.message === 'LLM 配置不存在。') {
        response.status(404).json({ message: error.message });
        return;
      }

      console.error('[LLM] set default provider error:', error);
      response.status(500).json({ message: '设置默认 LLM 失败。' });
    }
  });

  app.post('/api/llm/chat', createLlmChatHandler({ llmProviderStore }));
}
