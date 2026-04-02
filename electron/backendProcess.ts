import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type { OpsClawDesktopRuntime } from '../src/features/workbench/types.js';
import {
  OPSCLAW_BACKEND_POLL_INTERVAL_MS,
  OPSCLAW_BACKEND_READY_TIMEOUT_MS,
  OPSCLAW_BACKEND_SHUTDOWN_TIMEOUT_MS,
} from './constants.js';

type BuildBackendProcessEnvInput = {
  baseEnv: NodeJS.ProcessEnv;
  dataDir: string;
  port: number;
};

type BuildBackendRuntimeConfigInput = {
  port: number;
};

type StartBackendProcessInput = {
  baseEnv?: NodeJS.ProcessEnv;
  backendLogFilePath?: string;
  cwd: string;
  dataDir: string;
  isPackaged: boolean;
  resourcesPath: string;
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
};

type BackendLaunchConfig = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

export type StartedBackendProcess = {
  child: ChildProcess;
  port: number;
  runtime: OpsClawDesktopRuntime;
  stop: () => Promise<void>;
};

export function buildBackendProcessEnv(input: BuildBackendProcessEnvInput) {
  const env: NodeJS.ProcessEnv = {
    ...input.baseEnv,
    OPSCLAW_DATA_DIR: input.dataDir,
    OPSCLAW_DESKTOP: '1',
    PORT: String(input.port),
  };

  return env;
}

export function buildBackendRuntimeConfig(
  input: BuildBackendRuntimeConfigInput
): OpsClawDesktopRuntime {
  return {
    desktop: true,
    serverHttpBaseUrl: `http://127.0.0.1:${input.port}`,
    serverWebSocketBaseUrl: `ws://127.0.0.1:${input.port}`,
  };
}

async function findAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('无法分配本地 backend 端口。'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
    server.on('error', reject);
  });
}

function resolveBackendEntryPath(input: Pick<StartBackendProcessInput, 'cwd' | 'isPackaged' | 'resourcesPath'>) {
  if (input.isPackaged) {
    return path.join(input.resourcesPath, 'app.asar', 'dist-server', 'server', 'index.js');
  }

  return path.join(input.cwd, 'server', 'index.ts');
}

export { resolveBackendEntryPath };

export function resolveRendererIndexHtmlPath(resourcesPath: string) {
  return path.join(resourcesPath, 'app.asar', 'dist', 'index.html');
}

function buildBackendLaunchConfig(
  input: StartBackendProcessInput & { entryPath: string; port: number }
): BackendLaunchConfig {
  const env = buildBackendProcessEnv({
    baseEnv: input.baseEnv ?? process.env,
    dataDir: input.dataDir,
    port: input.port,
  });

  if (input.isPackaged) {
    return {
      command: process.execPath,
      args: [input.entryPath],
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
      },
    };
  }

  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['exec', 'tsx', input.entryPath],
    env,
  };
}

async function waitForBackendReady(
  runtime: OpsClawDesktopRuntime,
  input: Pick<StartBackendProcessInput, 'readyTimeoutMs' | 'pollIntervalMs'>
) {
  const timeoutMs = input.readyTimeoutMs ?? OPSCLAW_BACKEND_READY_TIMEOUT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? OPSCLAW_BACKEND_POLL_INTERVAL_MS;
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${runtime.serverHttpBaseUrl}/api/health`);
      if (response.ok) {
        return;
      }

      lastError = new Error(`backend health check failed with HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(pollIntervalMs);
  }

  throw new Error(
    `OpsClaw backend 启动超时：${lastError instanceof Error ? lastError.message : 'health check 未就绪'}`
  );
}

async function stopChildProcess(child: ChildProcess) {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  const timeout = delay(OPSCLAW_BACKEND_SHUTDOWN_TIMEOUT_MS).then(() => {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
  });

  await Promise.race([exited, timeout]);
  await exited;
}

export async function startBackendProcess(
  input: StartBackendProcessInput
): Promise<StartedBackendProcess> {
  const port = await findAvailablePort();
  const runtime = buildBackendRuntimeConfig({ port });
  const entryPath = resolveBackendEntryPath(input);
  const launchConfig = buildBackendLaunchConfig({
    ...input,
    entryPath,
    port,
  });

  const child = spawn(launchConfig.command, launchConfig.args, {
    cwd: input.cwd,
    env: launchConfig.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logStream = input.backendLogFilePath
    ? fs.createWriteStream(input.backendLogFilePath, { flags: 'a' })
    : null;

  let stderrText = '';
  child.stdout?.on('data', (chunk: Buffer | string) => {
    logStream?.write(`[${new Date().toISOString()}] [STDOUT] ${chunk.toString()}`);
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderrText += chunk.toString();
    logStream?.write(`[${new Date().toISOString()}] [STDERR] ${chunk.toString()}`);
  });

  await Promise.race([
    waitForBackendReady(runtime, input),
    new Promise<never>((_, reject) => {
      child.once('exit', (code, signal) => {
        reject(
          new Error(
            `OpsClaw backend 进程提前退出 (code=${code ?? 'null'}, signal=${signal ?? 'null'})${stderrText ? `: ${stderrText}` : ''}`
          )
        );
      });
    }),
  ]);

  return {
    child,
    port,
    runtime,
    stop() {
      return stopChildProcess(child);
    },
  };
}
