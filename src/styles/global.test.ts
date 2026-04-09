import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

void test('global styles reset the default body margin', () => {
  const stylesheet = readFileSync(
    resolve(import.meta.dirname, './global.css'),
    'utf8'
  );

  const bodyBlockMatch = stylesheet.match(/body\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(bodyBlockMatch, 'expected a body style block in global.css');
  assert.match(bodyBlockMatch[1], /margin:\s*0\s*;/);
});

void test('xterm viewport renders edge-to-edge without custom padding', () => {
  const stylesheet = readFileSync(
    resolve(import.meta.dirname, './global.css'),
    'utf8'
  );

  const xtermBlockMatch = stylesheet.match(/\.xterm\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(xtermBlockMatch, 'expected an .xterm style block in global.css');
  assert.doesNotMatch(xtermBlockMatch[1], /padding\s*:/);
});

void test('xterm viewport inherits the themed terminal background instead of hard black', () => {
  const stylesheet = readFileSync(
    resolve(import.meta.dirname, './global.css'),
    'utf8'
  );

  assert.match(
    stylesheet,
    /\.xterm\s*,\s*\n\s*\.xterm \.xterm-viewport\s*\{[\s\S]*background-color:\s*var\(--terminal-surface-bg,\s*transparent\)\s*!important;/
  );
});
