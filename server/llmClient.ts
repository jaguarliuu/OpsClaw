import { streamSimple, type Model, type UserMessage } from '@mariozechner/pi-ai';
import type { StoredLlmProvider } from './llmProviderStore.js';

export type LlmMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type LlmStreamChunk = {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
};

const PROVIDER_BASE_URLS = {
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com',
};

export async function* streamChat(
  provider: StoredLlmProvider,
  messages: LlmMessage[]
): AsyncGenerator<LlmStreamChunk> {
  try {
    const baseUrl = provider.baseUrl || PROVIDER_BASE_URLS[provider.providerType];

    const model: Model<'openai-completions'> = {
      id: provider.model,
      name: provider.model,
      api: 'openai-completions',
      provider: provider.providerType,
      baseUrl,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: provider.maxTokens * 2,
      maxTokens: provider.maxTokens,
    };

    const systemPrompt = messages.find(m => m.role === 'system')?.content;
    const userMessages: UserMessage[] = messages
      .filter(m => m.role === 'user')
      .map(m => ({
        role: 'user' as const,
        content: m.content,
        timestamp: Date.now(),
      }));

    const stream = streamSimple(model, {
      systemPrompt,
      messages: userMessages,
    }, {
      apiKey: provider.apiKey,
      temperature: provider.temperature,
      maxTokens: provider.maxTokens,
    });

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
