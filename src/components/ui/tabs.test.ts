import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

void test('tabs content hides inactive panels even when force-mounted', () => {
  const source = readFileSync(resolve(import.meta.dirname, './tabs.tsx'), 'utf8');

  assert.match(source, /data-\[state=inactive\]:hidden/);
});
