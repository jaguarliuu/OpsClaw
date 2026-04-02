import assert from 'node:assert/strict';
import test from 'node:test';

void test('buildFetchDebugMessage includes request url, page origin, and desktop runtime base urls', async () => {
  const { buildFetchDebugMessage } = await import('./httpDebugModel.js');

  assert.equal(
    buildFetchDebugMessage({
      method: 'GET',
      url: 'http://127.0.0.1:48321/api/nodes',
      error: new TypeError('Failed to fetch'),
      location: {
        protocol: 'file:',
        origin: 'file://',
      },
      runtime: {
        desktop: true,
        serverHttpBaseUrl: 'http://127.0.0.1:48321',
        serverWebSocketBaseUrl: 'ws://127.0.0.1:48321',
      },
    }),
    'GET http://127.0.0.1:48321/api/nodes failed: Failed to fetch | page=file:// | server=http://127.0.0.1:48321 | ws=ws://127.0.0.1:48321'
  );
});
