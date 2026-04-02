import { buildServerHttpBaseUrl } from './serverBase';
import type { LlmMessage, LlmStreamChunk } from './types';

type StreamLlmChatOptions = {
  providerId: string;
  model: string;
  messages: LlmMessage[];
  signal?: AbortSignal;
  onContent?: (chunk: string, fullText: string) => void;
};

export async function streamLlmChat({
  providerId,
  model,
  messages,
  signal,
  onContent,
}: StreamLlmChatOptions) {
  const response = await fetch(`${buildServerHttpBaseUrl()}/api/llm/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, model, messages }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法读取响应流');
  }

  const decoder = new TextDecoder();
  let assistantContent = '';
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

      const data = line.slice(6);

      try {
        const chunk = JSON.parse(data) as LlmStreamChunk;

        if (chunk.type === 'content' && chunk.content) {
          assistantContent += chunk.content;
          onContent?.(chunk.content, assistantContent);
          continue;
        }

        if (chunk.type === 'error') {
          throw new Error(chunk.error ?? '未知错误');
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
      }
    }
  }

  return assistantContent;
}
