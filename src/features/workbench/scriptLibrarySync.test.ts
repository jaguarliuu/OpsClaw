import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

void test('script saves dispatch a script-library changed signal and terminal panes subscribe to it', () => {
  const scriptApiSource = readFileSync(
    resolve(import.meta.dirname, './scriptApi.ts'),
    'utf8'
  );
  const terminalPaneSource = readFileSync(
    resolve(import.meta.dirname, './SshTerminalPane.tsx'),
    'utf8'
  );

  assert.match(scriptApiSource, /dispatchScriptLibraryChanged/);
  assert.match(terminalPaneSource, /subscribeScriptLibraryChanged/);
});
