import { buildServerHttpBaseUrl } from './serverBase';
import {
  parseAgentStreamEvent,
  type AgentApprovalMode,
  type AgentRunSnapshot,
  type AgentStreamEvent,
} from './types.agent';

type StreamAgentRunOptions = {
  providerId: string;
  model: string;
  task: string;
  sessionId: string;
  approvalMode?: AgentApprovalMode;
  maxSteps?: number;
  maxCommandOutputChars?: number;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; text: string }>;
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
  conversationHistory,
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
      conversationHistory,
    }),
    signal,
  });

  await consumeAgentEventStream(response, onEvent);
}

export async function submitAgentInteraction(
  runId: string,
  requestId: string,
  input: { selectedAction: string; payload: Record<string, unknown> }
) {
  const response = await fetch(
    `${buildServerHttpBaseUrl()}/api/agent/runs/${runId}/interactions/${requestId}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  return readJson<AgentRunSnapshot>(response);
}

export async function getReattachableAgentRun(sessionId: string) {
  const response = await fetch(
    `${buildServerHttpBaseUrl()}/api/agent/sessions/${sessionId}/runs/reattach`
  );

  const payload = await readJson<{ item: AgentRunSnapshot | null }>(response);
  return payload.item;
}

export async function streamAgentRunContinuation({
  runId,
  signal,
  onEvent,
}: {
  runId: string;
  signal?: AbortSignal;
  onEvent?: (event: AgentStreamEvent) => void;
}) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/agent/runs/${runId}/stream`, {
    method: 'POST',
    signal,
  });

  await consumeAgentEventStream(response, onEvent);
}

async function readJson<T>(response: Response) {
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

  return (await response.json()) as T;
}

async function consumeAgentEventStream(
  response: Response,
  onEvent?: (event: AgentStreamEvent) => void
) {
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

      const event = parseAgentStreamEvent(payload);
      onEvent?.(event);
    }
  }
}
