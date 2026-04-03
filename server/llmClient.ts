import {
  complete,
  stream,
  streamSimple,
  type Context,
  type Message,
  type Model,
  type ProviderStreamOptions,
} from '@mariozechner/pi-ai';
import {
  PROVIDER_BASE_URLS,
  type LlmProviderType,
  type StoredLlmProviderWithApiKey,
} from './llmProviderStore.js';

export type LlmMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type LlmStreamChunk = {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
};

function getRuntimeProviderName(providerType: LlmProviderType) {
  return providerType === 'openai_compatible' ? 'openai' : providerType;
}

export function buildProviderModel(
  provider: StoredLlmProviderWithApiKey,
  modelName: string
): Model<'openai-completions'> {
  const baseUrl = provider.baseUrl || PROVIDER_BASE_URLS[provider.providerType];

  return {
    id: modelName,
    name: modelName,
    api: 'openai-completions',
    provider: getRuntimeProviderName(provider.providerType),
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: provider.maxTokens * 2,
    maxTokens: provider.maxTokens,
  };
}

export function buildProviderOptions(
  provider: StoredLlmProviderWithApiKey,
  signal?: AbortSignal
): ProviderStreamOptions {
  return {
    apiKey: provider.apiKey,
    temperature: provider.temperature,
    maxTokens: provider.maxTokens,
    signal,
  };
}

export function buildChatMessages(messages: LlmMessage[]): Message[] {
  return messages
    .filter((message): message is Exclude<LlmMessage, { role: 'system' }> => message.role !== 'system')
    .map((message) => {
      if (message.role === 'user') {
        return {
          role: 'user' as const,
          content: message.content,
          timestamp: Date.now(),
        };
      }

      return {
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: message.content }],
        api: 'openai-completions',
        provider: 'openai',
        model: 'history',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        stopReason: 'stop' as const,
        timestamp: Date.now(),
      };
    });
}

export async function* streamChat(
  provider: StoredLlmProviderWithApiKey,
  modelName: string,
  messages: LlmMessage[],
  signal?: AbortSignal
): AsyncGenerator<LlmStreamChunk> {
  try {
    const model = buildProviderModel(provider, modelName);

    const systemPrompt = messages.find(m => m.role === 'system')?.content;

    const stream = streamSimple(model, {
      systemPrompt,
      messages: buildChatMessages(messages),
    }, buildProviderOptions(provider, signal));

    for await (const event of stream) {
      if (event.type === 'text_delta') {
        yield { type: 'content', content: event.delta };
      }
    }

    yield { type: 'done' };
  } catch (error) {
    yield { type: 'error', error: error instanceof Error ? error.message : '未知错误' };
  }
}

export async function completeAgentContext(
  provider: StoredLlmProviderWithApiKey,
  modelName: string,
  context: Context,
  signal?: AbortSignal
) {
  return complete(
    buildProviderModel(provider, modelName),
    context,
    buildProviderOptions(provider, signal)
  );
}

export function streamAgentContext(
  provider: StoredLlmProviderWithApiKey,
  modelName: string,
  context: Context,
  signal?: AbortSignal
) {
  return stream(
    buildProviderModel(provider, modelName),
    context,
    buildProviderOptions(provider, signal)
  );
}
