import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

void test('help dialog reserves desktop header safe area and exposes a native dialog close control', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, './HelpDialog.tsx'),
    'utf8'
  );

  assert.match(source, /buildDesktopPanelHeaderStyle/);
  assert.match(source, /<DialogClose asChild>/);
});
