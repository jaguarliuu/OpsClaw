import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readSftpRightDrawerSource() {
  return readFileSync(resolve(import.meta.dirname, './SftpRightDrawer.tsx'), 'utf8');
}

void test('sftp right drawer returns null when open is false', () => {
  const source = readSftpRightDrawerSource();

  assert.match(source, /if \(!open\) {\s*return null;\s*}/);
});
