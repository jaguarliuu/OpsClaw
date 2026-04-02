import assert from 'node:assert/strict';
import test from 'node:test';

import type { LlmMessage } from './types.js';
import {
  applyStreamingChatContent,
  clearStreamingChatState,
  createStreamingChatStartState,
  createStreamingChatState,
  failStreamingChat,
  finishStreamingChat,
  stopStreamingChat,
} from './useStreamingChatModel.js';

void test('createStreamingChatStartState appends the user message and enters streaming mode', () => {
  const initialMessages: LlmMessage[] = [{ role: 'assistant', content: 'hello' }];

  assert.deepEqual(
    createStreamingChatStartState(
      createStreamingChatState({
        messages: initialMessages,
        isStreaming: false,
        error: 'old error',
      }),
      'check disk'
    ),
    {
      messages: [
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'check disk' },
      ],
      isStreaming: true,
      error: null,
    }
  );
});

void test('applyStreamingChatContent appends the first assistant chunk and then replaces the trailing assistant message', () => {
  const startState = createStreamingChatState({
    messages: [{ role: 'user', content: 'check disk' }],
    isStreaming: true,
    error: null,
  });

  const firstChunkState = applyStreamingChatContent(startState, 'checking...');
  assert.deepEqual(firstChunkState.messages, [
    { role: 'user', content: 'check disk' },
    { role: 'assistant', content: 'checking...' },
  ]);

  const nextChunkState = applyStreamingChatContent(firstChunkState, 'checking...\nall good');
  assert.deepEqual(nextChunkState.messages, [
    { role: 'user', content: 'check disk' },
    { role: 'assistant', content: 'checking...\nall good' },
  ]);
});

void test('finishStreamingChat and failStreamingChat leave transcript intact while updating status', () => {
  const streamingState = createStreamingChatState({
    messages: [
      { role: 'user', content: 'check disk' },
      { role: 'assistant', content: 'all good' },
    ],
    isStreaming: true,
    error: null,
  });

  assert.deepEqual(finishStreamingChat(streamingState), {
    messages: [
      { role: 'user', content: 'check disk' },
      { role: 'assistant', content: 'all good' },
    ],
    isStreaming: false,
    error: null,
  });

  assert.deepEqual(failStreamingChat(streamingState, '请求失败'), {
    messages: [
      { role: 'user', content: 'check disk' },
      { role: 'assistant', content: 'all good' },
    ],
    isStreaming: false,
    error: '请求失败',
  });
});

void test('stopStreamingChat preserves messages while clearStreamingChatState resets the transcript', () => {
  const streamingState = createStreamingChatState({
    messages: [
      { role: 'user', content: 'check disk' },
      { role: 'assistant', content: 'all good' },
    ],
    isStreaming: true,
    error: null,
  });

  assert.deepEqual(stopStreamingChat(streamingState), {
    messages: [
      { role: 'user', content: 'check disk' },
      { role: 'assistant', content: 'all good' },
    ],
    isStreaming: false,
    error: null,
  });

  assert.deepEqual(clearStreamingChatState(), {
    messages: [],
    isStreaming: false,
    error: null,
  });
});
