import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readWorkbenchSource() {
  return readFileSync(resolve(import.meta.dirname, './WorkbenchPage.tsx'), 'utf8');
}

void test('keeps terminal workspace mounted when primary view switches to sftp', () => {
  const source = readWorkbenchSource();

  assert.match(source, /<TerminalWorkspace/);
  assert.doesNotMatch(source, /\{primaryView\.state\.mode === 'terminal' \?/);
});

void test('hides terminal workspace without collapsing layout when sftp is active', () => {
  const source = readWorkbenchSource();

  assert.doesNotMatch(source, /display:\s*'none'/);
  assert.match(source, /visibility:\s*isTerminalWorkspaceVisible \? 'visible' : 'hidden'/);
  assert.match(source, /pointer-events-none/);
  assert.match(source, /<TerminalWorkspace[\s\S]*visible=\{isTerminalWorkspaceVisible\}/);
});

void test('blurs active terminal focus when terminal workspace is hidden for sftp', () => {
  const source = readWorkbenchSource();

  assert.match(source, /isTerminalWorkspaceVisible \|\| typeof document === 'undefined'/);
  assert.match(source, /const activeElement = document\.activeElement/);
  assert.match(source, /container\.contains\(activeElement\)/);
  assert.match(source, /activeElement\.blur\(\)/);
});

void test('restores active terminal session from primary view state when closing sftp', () => {
  const source = readWorkbenchSource();

  assert.match(source, /setActiveSessionId\(primaryView\.state\.sessionId\)/);
  assert.match(source, /onClose=\{handleCloseSftp\}/);
});
