import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readSftpApiSource() {
  return readFileSync(resolve(import.meta.dirname, './sftpApi.ts'), 'utf8');
}

void test('uploadSftpBrowserFile does not send non-ascii filename headers in browser requests', () => {
  const source = readSftpApiSource();

  assert.match(source, /export async function uploadSftpBrowserFile/);
  assert.doesNotMatch(source, /X-OpsClaw-File-Name/);
  assert.match(source, /'Content-Type': 'application\/octet-stream'/);
});
