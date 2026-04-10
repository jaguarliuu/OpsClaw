import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNodeInspectionExecRequest } from './nodeInspectionRunner.js';

void test('buildNodeInspectionExecRequest sends the inspection script via stdin instead of shell-escaped command line', () => {
  const script = [
    "json_escape() { printf '%s' \"$1\" | sed 's/\\\\/\\\\\\\\/g; s/\"/\\\\\"/g'; }",
    "awk 'BEGIN { printf \"%.1f\", 1 }'",
    'printf \'{"ok":true}\\n\'',
  ].join('\n');

  const result = buildNodeInspectionExecRequest(script);

  assert.equal(result.command, 'sh -s');
  assert.equal(result.stdin, `${script}\n`);
});
