import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

void test('csv import modal uses app theme tokens instead of hard-coded dark colors', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, './CsvImportModal.tsx'),
    'utf8'
  );

  assert.match(source, /var\(--app-bg-/);
  assert.match(source, /var\(--app-text-/);
  assert.match(source, /var\(--app-border-/);
  assert.doesNotMatch(source, /bg-\[#17181b\]|bg-\[#0a0b0d\]|text-neutral-500|text-neutral-600/);
});
