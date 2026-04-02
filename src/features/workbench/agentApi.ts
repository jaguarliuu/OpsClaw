import { buildServerHttpBaseUrl } from './serverBase';
import type { AgentApprovalMode, AgentStreamEvent } from './types.agent';

type StreamAgentRunOptions = {
  providerId: string;
  model: string;
  task: string;
  sessionId: string;
  approvalMode?: AgentApprovalMode;
  maxSteps?: number;
  maxCommandOutputChars?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentStreamEvent) => void;
};

export async function streamAgentRun({
  providerId,
  model,
  task,
  sessionId,
  approvalMode,
  maxSteps,
  maxCommandOutputChars,
  signal,
  onEvent,
}: StreamAgentRunOptions) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/agent/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId,
      model,
      task,
      sessionId,
      approvalMode,
      maxSteps,
      maxCommandOutputChars,
    }),
    signal,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;

    try {
      const payload = (await response.json()) as { message?: string };
      message = payload.message ?? message;
    } catch {
      // ignore invalid JSON payload
    }

    throw new Error(message);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取 Agent 响应流');
  }

  const decoder = new TextDecoder();
  let pendingText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    pendingText += decoder.decode(value, { stream: true });
    const lines = pendingText.split('\n');
    pendingText = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }

      const payload = line.slice(6);
      if (!payload.trim()) {
        continue;
      }

      const event = JSON.parse(payload) as AgentStreamEvent;
      onEvent?.(event);
    }
  }
}
