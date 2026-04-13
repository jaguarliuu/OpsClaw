import assert from 'node:assert/strict';
import test from 'node:test';

import type { SftpDirectoryEntry } from './types.js';
import {
  classifySftpActionRisk,
  sortSftpEntries,
} from './sftpModel.js';

void test('sortSftpEntries keeps directories before files and sorts names stably', () => {
  const items: SftpDirectoryEntry[] = [
    {
      name: 'zeta.log',
      path: '/srv/zeta.log',
      kind: 'file',
      size: 12,
      mtimeMs: null,
      permissions: '-rw-r--r--',
    },
    {
      name: 'alpha',
      path: '/srv/alpha',
      kind: 'directory',
      size: null,
      mtimeMs: null,
      permissions: 'drwxr-xr-x',
    },
    {
      name: 'beta',
      path: '/srv/beta',
      kind: 'directory',
      size: null,
      mtimeMs: null,
      permissions: 'drwxr-xr-x',
    },
    {
      name: 'aardvark.txt',
      path: '/srv/aardvark.txt',
      kind: 'file',
      size: 4,
      mtimeMs: null,
      permissions: '-rw-r--r--',
    },
  ];

  assert.deepEqual(
    sortSftpEntries(items).map((item) => `${item.kind}:${item.name}`),
    [
      'directory:alpha',
      'directory:beta',
      'file:aardvark.txt',
      'file:zeta.log',
    ]
  );
  assert.equal(items[0]?.name, 'zeta.log');
});

void test('classifySftpActionRisk escalates destructive and overwrite flows', () => {
  assert.equal(
    classifySftpActionRisk({
      action: 'delete',
      selectionCount: 2,
      overwriting: false,
    }),
    'approval'
  );
  assert.equal(
    classifySftpActionRisk({
      action: 'upload',
      selectionCount: 1,
      overwriting: true,
    }),
    'approval'
  );
  assert.equal(
    classifySftpActionRisk({
      action: 'chmod',
      selectionCount: 1,
      overwriting: false,
    }),
    'approval'
  );
  assert.equal(
    classifySftpActionRisk({
      action: 'upload',
      selectionCount: 1,
      overwriting: false,
    }),
    'direct'
  );
});
