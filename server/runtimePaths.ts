import path from 'node:path';

type ResolveOpsClawDataDirInput = {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

const OPSCLAW_DATA_SUBDIR = 'data';

export function resolveOpsClawDataDir(input: ResolveOpsClawDataDirInput) {
  const configured = input.env.OPSCLAW_DATA_DIR?.trim();
  if (configured) {
    return path.resolve(input.cwd, configured);
  }

  return path.resolve(input.cwd);
}

export function resolveDatabaseFilePath(dataDir: string) {
  return path.join(dataDir, OPSCLAW_DATA_SUBDIR, 'opsclaw.sqlite');
}

export function resolveSecretKeyFilePath(dataDir: string) {
  return path.join(dataDir, OPSCLAW_DATA_SUBDIR, 'opsclaw.master.key');
}

export function resolveMemoryRootDir(dataDir: string) {
  return path.join(dataDir, OPSCLAW_DATA_SUBDIR, 'memory');
}
