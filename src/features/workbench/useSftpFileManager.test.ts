import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readUseSftpFileManagerSource() {
  return readFileSync(resolve(import.meta.dirname, './useSftpFileManager.ts'), 'utf8');
}

void test('useSftpFileManager keeps local approval state and handlers', () => {
  const source = readUseSftpFileManagerSource();

  assert.match(source, /const \[pendingApproval, setPendingApproval\] = useState/);
  assert.match(source, /const confirmApproval = useCallback/);
  assert.match(source, /const dismissApproval = useCallback/);
  assert.match(source, /pendingApproval,/);
  assert.match(source, /confirmApproval,/);
  assert.match(source, /dismissApproval,/);
});

void test('useSftpFileManager builds overwrite upload and batch delete approvals locally', () => {
  const source = readUseSftpFileManagerSource();

  assert.match(source, /buildSftpApprovalRequest\(\s*\{\s*kind: 'overwrite_upload'/);
  assert.match(source, /buildSftpApprovalRequest\(\s*\{\s*kind: 'batch_delete'/);
});
