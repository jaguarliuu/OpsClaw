import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeDialogOptions,
  normalizeOpenDialogResult,
  normalizeSaveDialogResult,
} from './nativeDialogs.js';

test('normalizeOpenDialogResult strips empty entries while preserving exact non-empty paths', () => {
  assert.deepEqual(
    normalizeOpenDialogResult({
      canceled: false,
      filePaths: ['/tmp/a.txt', '', '   ', '/tmp/with-trailing-space '],
    }),
    {
      canceled: false,
      paths: ['/tmp/a.txt', '   ', '/tmp/with-trailing-space '],
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

  assert.deepEqual(
    normalizeSaveDialogResult({
      canceled: false,
      filePath: '/tmp/out.log ',
    }),
    {
      canceled: false,
      path: '/tmp/out.log ',
    }
  );
});

test('normalizeDialogOptions accepts object payloads and drops non-object payloads', () => {
  assert.equal(normalizeDialogOptions(undefined), undefined);
  assert.equal(normalizeDialogOptions(null), undefined);
  assert.equal(normalizeDialogOptions('oops'), undefined);
  assert.equal(normalizeDialogOptions(1), undefined);

  assert.deepEqual(normalizeDialogOptions({ title: 'Choose file' }), {
    title: 'Choose file',
  });
});
