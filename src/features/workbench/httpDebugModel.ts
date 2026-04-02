import type { OpsClawDesktopRuntime } from './types';

type HttpDebugLocation = {
  protocol: string;
  origin: string;
};

type BuildFetchDebugMessageInput = {
  method: string;
  url: string;
  error: unknown;
  location: HttpDebugLocation;
  runtime?: OpsClawDesktopRuntime;
};

export function buildFetchDebugMessage(input: BuildFetchDebugMessageInput) {
  const reason = input.error instanceof Error ? input.error.message : String(input.error);

  return [
    `${input.method} ${input.url} failed: ${reason}`,
    `page=${input.location.origin}`,
    `server=${input.runtime?.serverHttpBaseUrl ?? 'n/a'}`,
    `ws=${input.runtime?.serverWebSocketBaseUrl ?? 'n/a'}`,
  ].join(' | ');
}
