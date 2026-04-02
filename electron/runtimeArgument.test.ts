import assert from 'node:assert/strict';
import test from 'node:test';

void test('encodeRuntimeArgument prefixes desktop runtime payload with a non-switch argv marker', async () => {
  const { encodeRuntimeArgument } = await import('./runtimeArgument.js');

  const argument = encodeRuntimeArgument({
    desktop: true,
    serverHttpBaseUrl: 'http://127.0.0.1:48321',
    serverWebSocketBaseUrl: 'ws://127.0.0.1:48321',
  });

  assert.match(argument, /^opsclaw-runtime=/);
});

void test('decodeRuntimeArgument restores desktop runtime from renderer argv', async () => {
  const { decodeRuntimeArgument, encodeRuntimeArgument } = await import('./runtimeArgument.js');

  const runtime = {
    desktop: true,
    serverHttpBaseUrl: 'http://127.0.0.1:48321',
    serverWebSocketBaseUrl: 'ws://127.0.0.1:48321',
  };

  assert.deepEqual(
    decodeRuntimeArgument(['/path/to/electron', encodeRuntimeArgument(runtime)]),
    runtime
  );
});
