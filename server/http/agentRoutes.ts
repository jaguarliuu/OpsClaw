import {
  type HttpApiDependencies,
  type HttpRouteApp,
  isRecord,
  readRequiredString,
} from './support.js';
import { createAgentEventStream, serializeSseEvent } from './agentEventStream.js';

export function registerAgentRoutes(
  app: HttpRouteApp,
  { llmProviderStore, agentRuntime }: Pick<HttpApiDependencies, 'llmProviderStore' | 'agentRuntime'>
) {
  app.get('/api/agent/sessions/:sessionId/runs/reattach', (request, response) => {
    try {
      const snapshot = agentRuntime.getSessionReattachableRun(request.params.sessionId);
      response.json({ item: snapshot });
    } catch (error) {
      console.error('[Agent] get reattachable run error:', error);
      response.status(500).json({ message: '读取可恢复的 Agent run 失败。' });
    }
  });

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

      const stream = createAgentEventStream(request, response);
      const emitEvent = (event: unknown) => {
        stream.emit(event);
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
          emitEvent,
          stream.signal
        );
      } finally {
        stream.close();
      }
    } catch (error) {
      console.error('[Agent] run error:', error);
      if (!response.headersSent) {
        response.status(500).json({ message: 'Agent 执行失败。' });
        return;
      }

      response.write(
        serializeSseEvent({
          type: 'run_failed',
          runId: 'unknown',
          error: error instanceof Error ? error.message : 'Agent 执行失败。',
          timestamp: Date.now(),
        })
      );
      response.end();
    }
  });

  app.post('/api/agent/runs/:runId/gates/:gateId/resume-waiting', (request, response) => {
    try {
      const snapshot = agentRuntime.resumeWaiting(request.params.runId, request.params.gateId);
      response.json(snapshot);
    } catch (error) {
      console.error('[Agent] resume gate error:', error);
      response.status(500).json({ message: '恢复等待中的 Agent gate 失败。' });
    }
  });

  app.post('/api/agent/runs/:runId/gates/:gateId/resolve', (request, response) => {
    try {
      const body = isRecord(request.body) ? request.body : {};
      const fields = isRecord(body.fields)
        ? Object.fromEntries(
            Object.entries(body.fields).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
          )
        : undefined;
      const snapshot = agentRuntime.resolveGate(request.params.runId, request.params.gateId, {
        fields,
      });
      response.json(snapshot);
    } catch (error) {
      console.error('[Agent] resolve gate error:', error);
      response.status(500).json({ message: '批准 Agent gate 失败。' });
    }
  });

  app.post('/api/agent/runs/:runId/gates/:gateId/reject', (request, response) => {
    try {
      const snapshot = agentRuntime.rejectGate(request.params.runId, request.params.gateId);
      response.json(snapshot);
    } catch (error) {
      console.error('[Agent] reject gate error:', error);
      response.status(500).json({ message: '拒绝 Agent gate 失败。' });
    }
  });

  app.post('/api/agent/runs/:runId/stream', async (request, response) => {
    try {
      const stream = createAgentEventStream(request, response);
      const emitEvent = (event: unknown) => {
        stream.emit(event);
      };

      try {
        await agentRuntime.streamContinuation(
          request.params.runId,
          emitEvent,
          stream.signal
        );
      } finally {
        stream.close();
      }
    } catch (error) {
      console.error('[Agent] continuation stream error:', error);
      if (!response.headersSent) {
        response.status(500).json({ message: 'Agent 继续执行失败。' });
        return;
      }

      response.write(
        serializeSseEvent({
          type: 'run_failed',
          runId: request.params.runId,
          error: error instanceof Error ? error.message : 'Agent 继续执行失败。',
          timestamp: Date.now(),
        })
      );
      response.end();
    }
  });
}
