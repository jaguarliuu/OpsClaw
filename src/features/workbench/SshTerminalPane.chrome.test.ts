import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

void test('ssh terminal pane renders within a padded framed surface', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, './SshTerminalPane.tsx'),
    'utf8'
  );

  assert.match(source, /relative block h-full w-full px-3 pt-3 pb-1/);
  assert.match(source, /relative h-full w-full overflow-hidden rounded-xl bg-\[var\(--app-bg-elevated2\)\]/);
  assert.doesNotMatch(source, /border border-\[var\(--app-border-default\)\]/);
  assert.doesNotMatch(source, /inset_0_1px_0/);
});
