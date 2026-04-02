import type { OpsClawDesktopRuntime } from './types';

export type ServerBaseLocation = {
  protocol: string;
  hostname: string;
  host: string;
  port: string;
  origin: string;
  search?: string;
};

type ResolveServerBaseInput = {
  runtime?: OpsClawDesktopRuntime;
  envHttpBaseUrl?: string;
  envWebSocketBaseUrl?: string;
  location: ServerBaseLocation;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function deriveFromLocation(location: ServerBaseLocation) {
  if (isLocalHostname(location.hostname) && location.port !== '4000') {
    const socketProtocol = location.protocol === 'https:' ? 'wss' : 'ws';

    return {
      httpBaseUrl: `${location.protocol}//${location.hostname}:4000`,
      webSocketBaseUrl: `${socketProtocol}://${location.hostname}:4000`,
    };
  }

  const socketProtocol = location.protocol === 'https:' ? 'wss' : 'ws';

  return {
    httpBaseUrl: location.origin,
    webSocketBaseUrl: `${socketProtocol}://${location.host}`,
  };
}

export function readDesktopRuntimeFromLocationSearch(search: string) {
  const params = new URLSearchParams(search);
  if (params.get('opsclawDesktop') !== '1') {
    return undefined;
  }

  const serverHttpBaseUrl = params.get('serverHttpBaseUrl');
  const serverWebSocketBaseUrl = params.get('serverWebSocketBaseUrl');

  if (!serverHttpBaseUrl || !serverWebSocketBaseUrl) {
    return undefined;
  }

  return {
    desktop: true,
    serverHttpBaseUrl,
    serverWebSocketBaseUrl,
  } satisfies OpsClawDesktopRuntime;
}

export function resolveServerHttpBaseUrl(input: ResolveServerBaseInput) {
  if (input.runtime?.serverHttpBaseUrl) {
    return trimTrailingSlash(input.runtime.serverHttpBaseUrl);
  }

  if (input.envHttpBaseUrl) {
    return trimTrailingSlash(input.envHttpBaseUrl);
  }

  return deriveFromLocation(input.location).httpBaseUrl;
}

export function resolveServerWebSocketBaseUrl(input: ResolveServerBaseInput) {
  if (input.runtime?.serverWebSocketBaseUrl) {
    return trimTrailingSlash(input.runtime.serverWebSocketBaseUrl);
  }

  if (input.envWebSocketBaseUrl) {
    return trimTrailingSlash(input.envWebSocketBaseUrl);
  }

  return deriveFromLocation(input.location).webSocketBaseUrl;
}
