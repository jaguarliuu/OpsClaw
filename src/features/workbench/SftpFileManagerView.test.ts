import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readSftpFileManagerViewSource() {
  return readFileSync(resolve(import.meta.dirname, './SftpFileManagerView.tsx'), 'utf8');
}

void test('sftp file manager binds drawer width to drawer open state', () => {
  const source = readSftpFileManagerViewSource();

  assert.match(
    source,
    /model\.drawerOpen \? 'grid-cols-\[minmax\(0,1fr\)_360px\]' : 'grid-cols-\[minmax\(0,1fr\)\]'/
  );
});

void test('sftp file manager only mounts right drawer while drawer is open', () => {
  const source = readSftpFileManagerViewSource();

  assert.match(source, /\{model\.drawerOpen \? \(\s*<SftpRightDrawer/);
});

void test('sftp file manager reuses InteractionCard for local approvals', () => {
  const source = readSftpFileManagerViewSource();

  assert.match(source, /import \{ InteractionCard \} from ['"]@\/features\/workbench\/InteractionCard['"]/);
  assert.match(source, /\{model\.pendingApproval \? \(/);
  assert.match(source, /<InteractionCard/);
});

void test('sftp file manager exposes a delete entry point', () => {
  const source = readSftpFileManagerViewSource();

  assert.match(source, /删除/);
  assert.match(source, /model\.handleDeleteIntent/);
});
