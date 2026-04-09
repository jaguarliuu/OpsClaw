import { setTimeout as delay } from 'node:timers/promises';

import type { SessionSystemInfo } from './agent/sessionRegistry.js';

type ExecChannel = {
  on: (event: 'close' | 'data', listener: (...args: unknown[]) => void) => void;
  stderr: {
    on: (event: 'data', listener: (...args: unknown[]) => void) => void;
  };
  close?: () => void;
};

type ExecCapableClient = {
  exec: (
    command: string,
    callback: (error: Error | undefined, channel: ExecChannel) => void
  ) => void;
};

const UNKNOWN_VALUE = 'unknown';
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

function normalizeProbeValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : UNKNOWN_VALUE;
}

export function buildSessionSystemInfoProbeCommand() {
  return [
    "sh -lc '",
    '. /etc/os-release 2>/dev/null || true;',
    'if command -v apt-get >/dev/null 2>&1; then PKG=apt;',
    'elif command -v dnf >/dev/null 2>&1; then PKG=dnf;',
    'elif command -v yum >/dev/null 2>&1; then PKG=yum;',
    'else PKG=unknown; fi;',
    "printf \"DISTRO_ID=%s\\n\" \"${ID:-unknown}\";",
    "printf \"VERSION_ID=%s\\n\" \"${VERSION_ID:-unknown}\";",
    "printf \"PACKAGE_MANAGER=%s\\n\" \"$PKG\";",
    "printf \"KERNEL=%s\\n\" \"$(uname -r 2>/dev/null || echo unknown)\";",
    "printf \"ARCH=%s\\n\" \"$(uname -m 2>/dev/null || echo unknown)\";",
    "printf \"DEFAULT_SHELL=%s\\n\" \"${SHELL:-unknown}\"",
    "'",
  ].join(' ');
}

export function parseSessionSystemInfoProbeOutput(output: string): SessionSystemInfo {
  const values = new Map<string, string>();

  for (const line of output.split(/\r?\n/)) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    values.set(key, value);
  }

  return {
    distributionId: normalizeProbeValue(values.get('DISTRO_ID')),
    versionId: normalizeProbeValue(values.get('VERSION_ID')),
    packageManager: normalizeProbeValue(values.get('PACKAGE_MANAGER')),
    kernel: normalizeProbeValue(values.get('KERNEL')),
    architecture: normalizeProbeValue(values.get('ARCH')),
    defaultShell: normalizeProbeValue(values.get('DEFAULT_SHELL')),
  };
}

export function buildSessionSystemInfoSummaryLines(info: SessionSystemInfo) {
  return [
    `- 发行版：${info.distributionId} ${info.versionId}`.trim(),
    `- 包管理器：${info.packageManager}`,
    `- 内核：${info.kernel}`,
    `- 架构：${info.architecture}`,
    `- 默认 shell：${info.defaultShell}`,
  ];
}

export async function probeSessionSystemInfo(
  client: ExecCapableClient,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<SessionSystemInfo> {
  return new Promise<SessionSystemInfo>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let activeChannel: ExecChannel | null = null;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    const timeout = delay(timeoutMs).then(() => {
      settle(() => {
        activeChannel?.close?.();
        reject(new Error('系统信息探测超时。'));
      });
    });

    client.exec(buildSessionSystemInfoProbeCommand(), (error, channel) => {
      if (error) {
        settle(() => reject(error));
        return;
      }

      activeChannel = channel;
      channel.on('data', (chunk) => {
        stdout += chunk instanceof Buffer ? chunk.toString('utf8') : String(chunk);
      });
      channel.stderr.on('data', (chunk) => {
        stderr += chunk instanceof Buffer ? chunk.toString('utf8') : String(chunk);
      });
      channel.on('close', () => {
        settle(() => {
          void timeout;
          resolve(parseSessionSystemInfoProbeOutput(`${stdout}\n${stderr}`));
        });
      });
    });
  });
}
