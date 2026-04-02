import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveElectronModuleDir(importMetaUrl: string) {
  return path.dirname(fileURLToPath(importMetaUrl));
}

export function resolvePreloadPath(importMetaUrl: string) {
  return path.join(resolveElectronModuleDir(importMetaUrl), 'preload.js');
}
