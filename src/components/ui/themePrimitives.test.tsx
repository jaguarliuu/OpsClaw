import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const cardSourcePath = path.resolve('src/components/ui/card.tsx');
const dialogSourcePath = path.resolve('src/components/ui/dialog.tsx');

void test('Card primitives default to app theme text and surface tokens', async () => {
  const source = await fs.readFile(cardSourcePath, 'utf8');

  assert.match(source, /border-\[var\(--app-border-default\)\]/);
  assert.match(source, /bg-\[var\(--app-bg-elevated2\)\]/);
  assert.match(source, /text-\[var\(--app-text-primary\)\]/);
  assert.match(source, /text-\[var\(--app-text-secondary\)\]/);
});

void test('Dialog primitives default to app theme text and border tokens', async () => {
  const source = await fs.readFile(dialogSourcePath, 'utf8');

  assert.match(source, /border-\[var\(--app-border-default\)\]/);
  assert.match(source, /bg-\[var\(--app-bg-elevated\)\]/);
  assert.match(source, /text-\[var\(--app-text-primary\)\]/);
  assert.match(source, /text-\[var\(--app-text-secondary\)\]/);
});
