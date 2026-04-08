import {
  type HttpApiDependencies,
  type HttpRouteApp,
  isRecord,
  readRequiredString,
} from './support.js';
import { createAgentEventStream, serializeSseEvent } from './agentEventStream.js';

const VALID_INTERACTION_ACTIONS = [
  'approve',
  'reject',
  'submit',
  'continue_waiting',
  'acknowledge',
  'cancel',
] as const;
type InteractionSubmitAction = (typeof VALID_INTERACTION_ACTIONS)[number];

function isInteractionSubmitAction(value: string): value is InteractionSubmitAction {
  return VALID_INTERACTION_ACTIONS.includes(value as InteractionSubmitAction);
}

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

  app.post('/api/agent/runs/:runId/interactions/:requestId/submit', (request, response) => {
    try {
      const body = isRecord(request.body) ? request.body : {};
      const selectedAction = readRequiredString(body, 'selectedAction', '交互动作');
      if (!isInteractionSubmitAction(selectedAction)) {
        response.status(400).json({ message: '交互动作不合法。' });
        return;
      }
      const payload = isRecord(body.payload) ? body.payload : {};
      const snapshot = agentRuntime.submitInteraction(
        request.params.runId,
        request.params.requestId,
        {
          selectedAction,
          payload,
        }
      );
      response.json(snapshot);
    } catch (error) {
      console.error('[Agent] submit interaction error:', error);
      response.status(500).json({ message: '提交交互请求失败。' });
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
