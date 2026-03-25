function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function buildServerHttpBaseUrl() {
  const configuredBase =
    typeof import.meta.env.VITE_SERVER_HTTP_URL === 'string'
      ? import.meta.env.VITE_SERVER_HTTP_URL
      : undefined;

  if (configuredBase) {
    return configuredBase.replace(/\/$/, '');
  }

  if (isLocalHostname(window.location.hostname) && window.location.port !== '4000') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return window.location.origin;
}

export function buildServerWebSocketBaseUrl() {
  const configuredBase =
    typeof import.meta.env.VITE_TERMINAL_WS_URL === 'string'
      ? import.meta.env.VITE_TERMINAL_WS_URL
      : undefined;

  if (configuredBase) {
    return configuredBase.replace(/\/$/, '');
  }

  if (isLocalHostname(window.location.hostname) && window.location.port !== '4000') {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.hostname}:4000`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}`;
}
