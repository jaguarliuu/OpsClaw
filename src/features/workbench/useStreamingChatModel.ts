import type { LlmMessage } from './types';

export type StreamingChatState = {
  messages: LlmMessage[];
  isStreaming: boolean;
  error: string | null;
};

export function createStreamingChatState(
  state?: Partial<StreamingChatState>
): StreamingChatState {
  return {
    messages: state?.messages ?? [],
    isStreaming: state?.isStreaming ?? false,
    error: state?.error ?? null,
  };
}

export function createStreamingChatStartState(
  state: StreamingChatState,
  userMessage: string
): StreamingChatState {
  return {
    messages: [...state.messages, { role: 'user', content: userMessage }],
    isStreaming: true,
    error: null,
  };
}

export function applyStreamingChatContent(
  state: StreamingChatState,
  assistantContent: string
): StreamingChatState {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage?.role === 'assistant') {
    return {
      ...state,
      messages: [
        ...state.messages.slice(0, -1),
        { role: 'assistant', content: assistantContent },
      ],
    };
  }

  return {
    ...state,
    messages: [...state.messages, { role: 'assistant', content: assistantContent }],
  };
}

export function finishStreamingChat(state: StreamingChatState): StreamingChatState {
  return {
    ...state,
    isStreaming: false,
  };
}

export function failStreamingChat(
  state: StreamingChatState,
  error: string
): StreamingChatState {
  return {
    ...state,
    isStreaming: false,
    error,
  };
}

export function stopStreamingChat(state: StreamingChatState): StreamingChatState {
  return {
    ...state,
    isStreaming: false,
  };
}

export function clearStreamingChatState(): StreamingChatState {
  return createStreamingChatState();
}
