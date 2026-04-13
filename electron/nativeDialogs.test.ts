import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeOpenDialogResult,
  normalizeSaveDialogResult,
} from './nativeDialogs.js';

test('normalizeOpenDialogResult strips empty paths and preserves cancellation', () => {
  assert.deepEqual(
    normalizeOpenDialogResult({
      canceled: false,
      filePaths: ['/tmp/a.txt', '', '   ', '/tmp/b.txt'],
    }),
    {
      canceled: false,
      paths: ['/tmp/a.txt', '/tmp/b.txt'],
    }
  );

  assert.deepEqual(
    normalizeOpenDialogResult({
      canceled: true,
      filePaths: ['/tmp/a.txt'],
    }),
    {
      canceled: true,
      paths: [],
    }
  );
});

test('normalizeSaveDialogResult returns null path when user cancels', () => {
  assert.deepEqual(
    normalizeSaveDialogResult({
      canceled: true,
      filePath: '/tmp/out.log',
    }),
    {
      canceled: true,
      path: null,
    }
  );
});
