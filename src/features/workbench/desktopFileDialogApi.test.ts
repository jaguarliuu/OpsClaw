import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readDesktopFileDialogApiSource() {
  return readFileSync(resolve(import.meta.dirname, './desktopFileDialogApi.ts'), 'utf8');
}

void test('desktopFileDialogApi falls back to browser file input when desktop bridge is unavailable', () => {
  const source = readDesktopFileDialogApiSource();

  assert.match(source, /document\.createElement\('input'\)/);
  assert.match(source, /input\.type = 'file'/);
  assert.match(source, /input\.multiple = true/);
  assert.match(source, /window\.__OPSCLAW_FILE_DIALOG__.*pickFiles/s);
});

void test('desktopFileDialogApi no longer hard-fails save target selection in browser runtime', () => {
  const source = readDesktopFileDialogApiSource();

  assert.doesNotMatch(source, /throw new Error\('当前运行环境不支持原生文件选择器。'\)/);
  assert.match(source, /return \{ canceled: false, path: defaultPath \?\? null \}/);
});
