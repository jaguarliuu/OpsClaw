import {
  readDesktopRuntimeFromLocationSearch,
  resolveServerHttpBaseUrl,
  resolveServerWebSocketBaseUrl,
} from './serverBaseModel';

function readDesktopRuntime() {
  return window.__OPSCLAW_RUNTIME__ ?? readDesktopRuntimeFromLocationSearch(window.location.search);
}

export function buildServerHttpBaseUrl() {
  return resolveServerHttpBaseUrl({
    runtime: readDesktopRuntime(),
    envHttpBaseUrl:
      typeof import.meta.env.VITE_SERVER_HTTP_URL === 'string'
        ? import.meta.env.VITE_SERVER_HTTP_URL
        : undefined,
    location: window.location,
  });
}

export function buildServerWebSocketBaseUrl() {
  return resolveServerWebSocketBaseUrl({
    runtime: readDesktopRuntime(),
    envWebSocketBaseUrl:
      typeof import.meta.env.VITE_TERMINAL_WS_URL === 'string'
        ? import.meta.env.VITE_TERMINAL_WS_URL
        : undefined,
    location: window.location,
  });
}
