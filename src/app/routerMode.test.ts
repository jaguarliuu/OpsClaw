import assert from 'node:assert/strict';
import test from 'node:test';

void test('shouldUseHashRouter enables hash routing for desktop runtime', async () => {
  const { shouldUseHashRouter } = await import('./routerMode.js');

  assert.equal(
    shouldUseHashRouter({
      runtime: {
        desktop: true,
        serverHttpBaseUrl: 'http://127.0.0.1:4000',
        serverWebSocketBaseUrl: 'ws://127.0.0.1:4000',
      },
      location: { protocol: 'http:' },
    }),
    true
  );
});

void test('shouldUseHashRouter enables hash routing for file protocol pages', async () => {
  const { shouldUseHashRouter } = await import('./routerMode.js');

  assert.equal(
    shouldUseHashRouter({
      runtime: undefined,
      location: { protocol: 'file:' },
    }),
    true
  );
});

void test('shouldUseHashRouter keeps browser routing for normal web runtime', async () => {
  const { shouldUseHashRouter } = await import('./routerMode.js');

  assert.equal(
    shouldUseHashRouter({
      runtime: undefined,
      location: { protocol: 'http:' },
    }),
    false
  );
});
