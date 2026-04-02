import {
  type HttpApiDependencies,
  type HttpRouteApp,
  isRecord,
  readRequiredString,
} from './support.js';

export function registerAgentRoutes(
  app: HttpRouteApp,
  { llmProviderStore, agentRuntime }: Pick<HttpApiDependencies, 'llmProviderStore' | 'agentRuntime'>
) {
  app.post('/api/agent/runs', async (request, response) => {
    try {
      const body = isRecord(request.body) ? request.body : null;
      if (!body) {
        response.status(400).json({ message: 'Agent 请求格式错误。' });
        return;
      }

      const providerId = readRequiredString(body, 'providerId', 'LLM 配置');
      const model = readRequiredString(body, 'model', '模型');
      const task = readRequiredString(body, 'task', '任务');
      const sessionId = readRequiredString(body, 'sessionId', '会话');
      const approvalMode =
        body.approvalMode === 'manual-sensitive' ? 'manual-sensitive' : 'auto-readonly';
      const maxSteps =
        typeof body.maxSteps === 'number' && Number.isInteger(body.maxSteps)
          ? body.maxSteps
          : undefined;
      const maxCommandOutputChars =
        typeof body.maxCommandOutputChars === 'number' &&
        Number.isInteger(body.maxCommandOutputChars)
          ? body.maxCommandOutputChars
          : undefined;

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

      const emit = (
        event: Parameters<typeof agentRuntime.run>[1] extends (arg: infer T) => void ? T : never
      ) => {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        await agentRuntime.run(
          {
            providerId,
            provider,
            model,
            task,
            sessionId,
            approvalMode,
            maxSteps,
            maxCommandOutputChars,
          },
          emit,
          abortController.signal
        );
      } finally {
        finished = true;
        response.end();
      }
    } catch (error) {
      console.error('[Agent] run error:', error);
      if (!response.headersSent) {
        response.status(500).json({ message: 'Agent 执行失败。' });
        return;
      }

      response.write(
        `data: ${JSON.stringify({
          type: 'run_failed',
          runId: 'unknown',
          error: error instanceof Error ? error.message : 'Agent 执行失败。',
          timestamp: Date.now(),
        })}\n\n`
      );
      response.end();
    }
  });
}
