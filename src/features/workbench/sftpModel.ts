import type { SftpDirectoryEntry } from './types.js';

export type SftpActionRisk = 'direct' | 'approval';

export function sortSftpEntries(items: SftpDirectoryEntry[]) {
  return [...items].sort((left, right) => {
    if (left.kind !== right.kind) {
      if (left.kind === 'directory') {
        return -1;
      }
      if (right.kind === 'directory') {
        return 1;
      }
    }

    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

export function classifySftpActionRisk(input: {
  action: 'upload' | 'delete' | 'chmod';
  selectionCount: number;
  overwriting: boolean;
}): SftpActionRisk {
  if (input.action === 'delete' && input.selectionCount > 1) {
    return 'approval';
  }
  if (input.action === 'upload' && input.overwriting) {
    return 'approval';
  }
  if (input.action === 'chmod') {
    return 'approval';
  }

  return 'direct';
}
