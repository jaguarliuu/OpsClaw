import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveSshTerminalClipboardShortcut,
  resolveSshTerminalInput,
  shouldConfirmSshTerminalPaste,
  shouldToggleSshTerminalSearchShortcut,
} from './sshTerminalRuntimeModel.js';

void test('shouldToggleSshTerminalSearchShortcut matches Cmd/Ctrl+F keydown only', () => {
  assert.equal(
    shouldToggleSshTerminalSearchShortcut({
      ctrlKey: true,
      key: 'f',
      metaKey: false,
      type: 'keydown',
    }),
    true
  );
  assert.equal(
    shouldToggleSshTerminalSearchShortcut({
      ctrlKey: false,
      key: 'f',
      metaKey: true,
      type: 'keydown',
    }),
    true
  );
  assert.equal(
    shouldToggleSshTerminalSearchShortcut({
      ctrlKey: true,
      key: 'f',
      metaKey: false,
      type: 'keyup',
    }),
    false
  );
});

void test('shouldConfirmSshTerminalPaste only intercepts multiline paste', () => {
  assert.equal(shouldConfirmSshTerminalPaste('single line'), false);
  assert.equal(shouldConfirmSshTerminalPaste('line-1\nline-2'), true);
});

void test('resolveSshTerminalClipboardShortcut copies the current selection on Cmd/Ctrl+C only', () => {
  assert.equal(
    resolveSshTerminalClipboardShortcut({
      event: {
        ctrlKey: true,
        key: 'c',
        metaKey: false,
        type: 'keydown',
      },
      hasSelection: true,
    }),
    'copy-selection'
  );

  assert.equal(
    resolveSshTerminalClipboardShortcut({
      event: {
        ctrlKey: false,
        key: 'c',
        metaKey: true,
        type: 'keydown',
      },
      hasSelection: true,
    }),
    'copy-selection'
  );

  assert.equal(
    resolveSshTerminalClipboardShortcut({
      event: {
        ctrlKey: true,
        key: 'c',
        metaKey: false,
        type: 'keydown',
      },
      hasSelection: false,
    }),
    null
  );
});

void test('resolveSshTerminalClipboardShortcut pastes clipboard text on Cmd/Ctrl+V keydown only', () => {
  assert.equal(
    resolveSshTerminalClipboardShortcut({
      event: {
        ctrlKey: true,
        key: 'v',
        metaKey: false,
        type: 'keydown',
      },
      hasSelection: false,
    }),
    'paste-from-clipboard'
  );

  assert.equal(
    resolveSshTerminalClipboardShortcut({
      event: {
        ctrlKey: true,
        key: 'V',
        metaKey: false,
        type: 'keydown',
      },
      hasSelection: false,
    }),
    'paste-from-clipboard'
  );

  assert.equal(
    resolveSshTerminalClipboardShortcut({
      event: {
        ctrlKey: true,
        key: 'v',
        metaKey: false,
        type: 'keyup',
      },
      hasSelection: false,
    }),
    null
  );
});

void test('resolveSshTerminalInput accepts a suggestion on Tab and forwards only the remaining text', () => {
  assert.deepEqual(
    resolveSshTerminalInput({
      currentSuggestion: 'git status',
      data: '\t',
      inputBuffer: 'git ',
    }),
    {
      commandToRecord: null,
      forwardedInput: 'status',
      nextInputBuffer: 'git status',
      nextSuggestion: null,
      suggestionQuery: null,
    }
  );
});

void test('resolveSshTerminalInput records the buffered command on Enter and clears local input state', () => {
  assert.deepEqual(
    resolveSshTerminalInput({
      currentSuggestion: 'ls -la',
      data: '\r',
      inputBuffer: 'ls -la',
    }),
    {
      commandToRecord: 'ls -la',
      forwardedInput: '\r',
      nextInputBuffer: '',
      nextSuggestion: null,
      suggestionQuery: null,
    }
  );
});

void test('resolveSshTerminalInput updates the shadow buffer and suggestion query for backspace and printable input', () => {
  assert.deepEqual(
    resolveSshTerminalInput({
      currentSuggestion: 'ssh root@host',
      data: '\x7f',
      inputBuffer: 'ssh root',
    }),
    {
      commandToRecord: null,
      forwardedInput: '\x7f',
      nextInputBuffer: 'ssh roo',
      nextSuggestion: 'ssh root@host',
      suggestionQuery: 'ssh roo',
    }
  );

  assert.deepEqual(
    resolveSshTerminalInput({
      currentSuggestion: null,
      data: 'a',
      inputBuffer: 'l',
    }),
    {
      commandToRecord: null,
      forwardedInput: 'a',
      nextInputBuffer: 'la',
      nextSuggestion: null,
      suggestionQuery: 'la',
    }
  );
});

void test('resolveSshTerminalInput clears the buffer and suggestion for escape sequences and line-clearing controls', () => {
  assert.deepEqual(
    resolveSshTerminalInput({
      currentSuggestion: 'npm test',
      data: '\x15',
      inputBuffer: 'npm te',
    }),
    {
      commandToRecord: null,
      forwardedInput: '\x15',
      nextInputBuffer: '',
      nextSuggestion: null,
      suggestionQuery: null,
    }
  );

  assert.deepEqual(
    resolveSshTerminalInput({
      currentSuggestion: 'npm test',
      data: '\x1b[A',
      inputBuffer: 'npm te',
    }),
    {
      commandToRecord: null,
      forwardedInput: '\x1b[A',
      nextInputBuffer: '',
      nextSuggestion: null,
      suggestionQuery: null,
    }
  );
});
