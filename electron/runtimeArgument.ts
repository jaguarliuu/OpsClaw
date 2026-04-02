import type { OpsClawDesktopRuntime } from '../src/features/workbench/types.js';

const OPSCLAW_RUNTIME_ARGUMENT_PREFIX = 'opsclaw-runtime=';

export function encodeRuntimeArgument(runtime: OpsClawDesktopRuntime) {
  return `${OPSCLAW_RUNTIME_ARGUMENT_PREFIX}${Buffer.from(
    JSON.stringify(runtime),
    'utf8'
  ).toString('base64url')}`;
}

export function decodeRuntimeArgument(argv: string[]) {
  const payload = argv.find((value) => value.startsWith(OPSCLAW_RUNTIME_ARGUMENT_PREFIX));
  if (!payload) {
    return undefined;
  }

  try {
    return JSON.parse(
      Buffer.from(payload.slice(OPSCLAW_RUNTIME_ARGUMENT_PREFIX.length), 'base64url').toString(
        'utf8'
      )
    ) as OpsClawDesktopRuntime;
  } catch {
    return undefined;
  }
}
