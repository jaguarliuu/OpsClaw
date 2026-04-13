import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function readUseSftpFileManagerSource() {
  return readFileSync(resolve(import.meta.dirname, './useSftpFileManager.ts'), 'utf8');
}

function extractSection(source: string, startToken: string, endToken: string) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);

  assert.ok(start >= 0, `missing section start: ${startToken}`);
  assert.ok(end > start, `missing section end: ${endToken}`);

  return source.slice(start, end + endToken.length);
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

void test('useSftpFileManager refreshDirectory reconciles selection with current items', () => {
  const source = readUseSftpFileManagerSource();

  assert.match(source, /const nextItemPathSet = new Set\(payload\.items\.map\(\(item\) => item\.path\)\)/);
  assert.match(
    source,
    /const nextSelectedPaths = currentSelectedPaths\.filter\(\(selectedPath\) =>\s*nextItemPathSet\.has\(selectedPath\)/
  );
  assert.match(
    source,
    /if \(!arePathListsEqual\(currentSelectedPaths, nextSelectedPaths\)\) {\s*setSelectedPaths\(nextSelectedPaths\);/
  );
  assert.match(source, /if \(currentPendingApproval\?\.metadata\.kind === 'batch_delete'\)/);
});

void test('useSftpFileManager reconciles batch delete approval with current visible selection', () => {
  const source = readUseSftpFileManagerSource();

  assert.match(source, /if \(!nodeId \|\| pendingApproval\?\.metadata\.kind !== 'batch_delete'\)/);
  assert.match(
    source,
    /const nextApprovalPaths = currentApprovalPaths\.filter\(\(path\) => selectedPathSet\.has\(path\)\)/
  );
});

void test('useSftpFileManager does not clear pending approval in upload cancel or delete empty branches', () => {
  const source = readUseSftpFileManagerSource();
  const uploadSection = extractSection(
    source,
    'const handleUploadIntent = useCallback(async () => {',
    'const handleDownloadIntent = useCallback(async () => {'
  );
  const deleteSection = extractSection(
    source,
    'const handleDeleteIntent = useCallback(() => {',
    '  return {'
  );

  assert.doesNotMatch(uploadSection, /setPendingApproval\(null\)/);
  assert.doesNotMatch(deleteSection, /if \(selectedPaths\.length === 0\) \{\s*setPendingApproval\(null\);/);
});
