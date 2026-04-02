import assert from 'node:assert/strict';
import test from 'node:test';

type LocationStub = {
  protocol: string;
  hostname: string;
  host: string;
  port: string;
  origin: string;
  search?: string;
};

const localDevLocation: LocationStub = {
  protocol: 'http:',
  hostname: 'localhost',
  host: 'localhost:5173',
  port: '5173',
  origin: 'http://localhost:5173',
};

void test('resolveServerHttpBaseUrl prefers desktop runtime config over vite env and window origin', async () => {
  const { resolveServerHttpBaseUrl } = await import('./serverBaseModel.js');

  assert.equal(
    resolveServerHttpBaseUrl({
      runtime: { desktop: true, serverHttpBaseUrl: 'http://127.0.0.1:48321/', serverWebSocketBaseUrl: 'ws://127.0.0.1:48321/' },
      envHttpBaseUrl: 'http://localhost:4000',
      location: localDevLocation,
    }),
    'http://127.0.0.1:48321'
  );
});

void test('resolveServerHttpBaseUrl falls back to vite env before browser-derived defaults', async () => {
  const { resolveServerHttpBaseUrl } = await import('./serverBaseModel.js');

  assert.equal(
    resolveServerHttpBaseUrl({
      runtime: undefined,
      envHttpBaseUrl: 'http://localhost:4100/',
      location: localDevLocation,
    }),
    'http://localhost:4100'
  );
});

void test('resolveServerWebSocketBaseUrl prefers desktop runtime config', async () => {
  const { resolveServerWebSocketBaseUrl } = await import('./serverBaseModel.js');

  assert.equal(
    resolveServerWebSocketBaseUrl({
      runtime: { desktop: true, serverHttpBaseUrl: 'http://127.0.0.1:48321', serverWebSocketBaseUrl: 'ws://127.0.0.1:48321/' },
      envWebSocketBaseUrl: 'ws://localhost:4000',
      location: localDevLocation,
    }),
    'ws://127.0.0.1:48321'
  );
});

void test('readDesktopRuntimeFromLocationSearch restores desktop runtime from file url query parameters', async () => {
  const { readDesktopRuntimeFromLocationSearch } = await import('./serverBaseModel.js');

  assert.deepEqual(
    readDesktopRuntimeFromLocationSearch(
      '?opsclawDesktop=1&serverHttpBaseUrl=http%3A%2F%2F127.0.0.1%3A48321&serverWebSocketBaseUrl=ws%3A%2F%2F127.0.0.1%3A48321'
    ),
    {
      desktop: true,
      serverHttpBaseUrl: 'http://127.0.0.1:48321',
      serverWebSocketBaseUrl: 'ws://127.0.0.1:48321',
    }
  );
});

void test('resolve browser-derived server base urls preserve localhost dev fallback and remote origins', async () => {
  const {
    resolveServerHttpBaseUrl,
    resolveServerWebSocketBaseUrl,
  } = await import('./serverBaseModel.js');

  assert.equal(
    resolveServerHttpBaseUrl({
      runtime: undefined,
      envHttpBaseUrl: undefined,
      location: localDevLocation,
    }),
    'http://localhost:4000'
  );

  assert.equal(
    resolveServerWebSocketBaseUrl({
      runtime: undefined,
      envWebSocketBaseUrl: undefined,
      location: localDevLocation,
    }),
    'ws://localhost:4000'
  );

  const remoteLocation: LocationStub = {
    protocol: 'https:',
    hostname: 'opsclaw.example.com',
    host: 'opsclaw.example.com',
    port: '',
    origin: 'https://opsclaw.example.com',
  };

  assert.equal(
    resolveServerHttpBaseUrl({
      runtime: undefined,
      envHttpBaseUrl: undefined,
      location: remoteLocation,
    }),
    'https://opsclaw.example.com'
  );

  assert.equal(
    resolveServerWebSocketBaseUrl({
      runtime: undefined,
      envWebSocketBaseUrl: undefined,
      location: remoteLocation,
    }),
    'wss://opsclaw.example.com'
  );
});
