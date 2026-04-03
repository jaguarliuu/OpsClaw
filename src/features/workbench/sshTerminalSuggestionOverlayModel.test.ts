import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSshTerminalSuggestionOverlayPosition } from './sshTerminalSuggestionOverlayModel.js';

void test('resolveSshTerminalSuggestionOverlayPosition keeps the suggestion below the cursor when there is enough space', () => {
  assert.deepEqual(
    resolveSshTerminalSuggestionOverlayPosition({
      cursorRow: 2,
      overlayHeight: 40,
      totalRows: 20,
      viewportHeight: 400,
    }),
    {
      placement: 'below',
      top: 72,
    }
  );
});

void test('resolveSshTerminalSuggestionOverlayPosition flips the suggestion above the cursor near the terminal bottom', () => {
  assert.deepEqual(
    resolveSshTerminalSuggestionOverlayPosition({
      cursorRow: 19,
      overlayHeight: 40,
      totalRows: 20,
      viewportHeight: 400,
    }),
    {
      placement: 'above',
      top: 328,
    }
  );
});

void test('resolveSshTerminalSuggestionOverlayPosition clamps to a safe top offset when viewport data is incomplete', () => {
  assert.deepEqual(
    resolveSshTerminalSuggestionOverlayPosition({
      cursorRow: -3,
      overlayHeight: 0,
      totalRows: 0,
      viewportHeight: 0,
    }),
    {
      placement: 'below',
      top: 12,
    }
  );
});
