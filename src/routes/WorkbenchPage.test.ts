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
  assert.match(source, /visibility:\s*'hidden'/);
  assert.match(source, /pointerEvents:\s*'none'/);
  assert.match(source, /<TerminalWorkspace[\s\S]*visible=\{isTerminalWorkspaceVisible\}/);
});

void test('restores active terminal session from primary view state when closing sftp', () => {
  const source = readWorkbenchSource();

  assert.match(source, /setActiveSessionId\(primaryView\.state\.sessionId\)/);
  assert.match(source, /onClick=\{handleCloseSftp\}/);
});
