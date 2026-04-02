import path from 'node:path';

function resolveDesktopLogDir(userDataDir: string) {
  return path.join(userDataDir, 'logs');
}

export function resolveMainLogFilePath(userDataDir: string) {
  return path.join(resolveDesktopLogDir(userDataDir), 'main.log');
}

export function resolveBackendLogFilePath(userDataDir: string) {
  return path.join(resolveDesktopLogDir(userDataDir), 'backend.log');
}
