import assert from 'node:assert/strict';
import test from 'node:test';

import type { SftpDirectoryEntry } from './types.js';
import {
  buildDefaultSftpDrawerTab,
  buildTransferQueueSummary,
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

void test('buildDefaultSftpDrawerTab prefers preview for files and metadata for directories', () => {
  assert.equal(
    buildDefaultSftpDrawerTab({
      kind: 'file',
      previewable: true,
    }),
    'preview'
  );
  assert.equal(
    buildDefaultSftpDrawerTab({
      kind: 'directory',
      previewable: false,
    }),
    'metadata'
  );
});

void test('buildTransferQueueSummary aggregates running and failed tasks', () => {
  const summary = buildTransferQueueSummary([
    {
      taskId: '1',
      status: 'running',
      transferredBytes: 50,
      totalBytes: 100,
    },
    {
      taskId: '2',
      status: 'failed',
      transferredBytes: 0,
      totalBytes: 200,
    },
  ] as never);

  assert.equal(summary.runningCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.totalBytes, 300);
});
