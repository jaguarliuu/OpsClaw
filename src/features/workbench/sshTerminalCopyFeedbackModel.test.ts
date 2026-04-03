import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SSH_TERMINAL_COPY_FEEDBACK_DURATION_MS,
  buildSshTerminalCopyFeedbackText,
} from './sshTerminalCopyFeedbackModel.js';

void test('buildSshTerminalCopyFeedbackText returns a stable copy confirmation message', () => {
  assert.equal(buildSshTerminalCopyFeedbackText(), '已复制到剪贴板');
});

void test('SSH_TERMINAL_COPY_FEEDBACK_DURATION_MS keeps the terminal copy toast lightweight', () => {
  assert.equal(SSH_TERMINAL_COPY_FEEDBACK_DURATION_MS, 1200);
});
