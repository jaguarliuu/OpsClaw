import { useCallback, useRef, useState } from 'react';
import { streamLlmChat } from './llmApi';
import {
  applyStreamingChatContent,
  clearStreamingChatState,
  createStreamingChatStartState,
  createStreamingChatState,
  failStreamingChat,
  finishStreamingChat,
  stopStreamingChat,
  type StreamingChatState,
} from './useStreamingChatModel';

export function useStreamingChat() {
  const [state, setState] = useState<StreamingChatState>(() => createStreamingChatState());
  const abortControllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  const streamRequestIdRef = useRef(0);

  const sendMessage = useCallback((providerId: string, model: string, userMessage: string) => {
    const normalizedMessage = userMessage.trim();
    if (!normalizedMessage) {
      return;
    }

    const nextState = createStreamingChatStartState(stateRef.current, normalizedMessage);
    stateRef.current = nextState;
    setState(nextState);

    const requestId = streamRequestIdRef.current + 1;
    streamRequestIdRef.current = requestId;
    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;

    streamLlmChat({
      providerId,
      model,
      messages: nextState.messages,
      signal: controller.signal,
      onContent: (_chunk, fullText) => {
        if (streamRequestIdRef.current !== requestId) {
          return;
        }

        const contentState = applyStreamingChatContent(stateRef.current, fullText);
        stateRef.current = contentState;
        setState(contentState);
      },
    })
      .then(() => {
        if (streamRequestIdRef.current !== requestId) {
          return;
        }

        const completedState = finishStreamingChat(stateRef.current);
        stateRef.current = completedState;
        setState(completedState);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      })
      .catch((err) => {
        if (streamRequestIdRef.current !== requestId) {
          return;
        }

        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          const failedState = failStreamingChat(
            stateRef.current,
            err instanceof Error ? err.message : '请求失败'
          );
          stateRef.current = failedState;
          setState(failedState);
        }
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      });
  }, []);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    streamRequestIdRef.current += 1;
    const stoppedState = stopStreamingChat(stateRef.current);
    stateRef.current = stoppedState;
    setState(stoppedState);
  }, []);

  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    streamRequestIdRef.current += 1;
    const clearedState = clearStreamingChatState();
    stateRef.current = clearedState;
    setState(clearedState);
  }, []);

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    error: state.error,
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}
