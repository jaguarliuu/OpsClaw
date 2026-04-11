import test from 'node:test';
import assert from 'node:assert/strict';

import { decodeCsvImportBytes } from './csvImportModel.js';

void test('decodeCsvImportBytes decodes utf-8 text and strips utf-8 bom', () => {
  const bytes = Uint8Array.of(
    0xef,
    0xbb,
    0xbf,
    0x6e,
    0x61,
    0x6d,
    0x65,
    0x2c,
    0x68,
    0x6f,
    0x73,
    0x74
  );

  assert.equal(decodeCsvImportBytes(bytes), 'name,host');
});

void test('decodeCsvImportBytes falls back to gb18030 for chinese csv content', () => {
  const bytes = Uint8Array.of(
    0x6e,
    0x61,
    0x6d,
    0x65,
    0x2c,
    0x67,
    0x72,
    0x6f,
    0x75,
    0x70,
    0x4e,
    0x61,
    0x6d,
    0x65,
    0x0a,
    0xd6,
    0xd0,
    0xce,
    0xc4,
    0x2c,
    0xb2,
    0xe2,
    0xca,
    0xd4
  );

  assert.equal(decodeCsvImportBytes(bytes), 'name,groupName\n中文,测试');
});
