import { useCallback, useRef, useState } from 'react';
import type { LlmMessage, LlmStreamChunk } from './types';
import { buildServerHttpBaseUrl } from './serverBase';

export function useStreamingChat() {
  const [messages, setMessages] = useState<LlmMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback((providerId: string, model: string, userMessage: string) => {
    const newMessages: LlmMessage[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsStreaming(true);
    setError(null);

    let assistantContent = '';
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const url = `${buildServerHttpBaseUrl()}/api/llm/chat`;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, model, messages: newMessages }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('无法读取响应流');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const chunk = JSON.parse(data) as LlmStreamChunk;

                if (chunk.type === 'content' && chunk.content) {
                  assistantContent += chunk.content;
                  setMessages([...newMessages, { role: 'assistant', content: assistantContent }]);
                } else if (chunk.type === 'done') {
                  setIsStreaming(false);
                } else if (chunk.type === 'error') {
                  setError(chunk.error ?? '未知错误');
                  setIsStreaming(false);
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }

        setIsStreaming(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : '请求失败');
          setIsStreaming(false);
        }
      });
  }, [messages]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isStreaming, error, sendMessage, stopStreaming, clearMessages };
}
