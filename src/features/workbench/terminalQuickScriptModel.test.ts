import assert from 'node:assert/strict';
import test from 'node:test';

import type { ScriptLibraryItem } from './types.js';

import {
  detectTerminalQuickScriptQuery,
  findExactQuickScriptMatch,
} from './terminalQuickScriptModel.js';

void test('detectTerminalQuickScriptQuery only matches whole-line x prefix', () => {
  assert.equal(detectTerminalQuickScriptQuery('x nginx'), 'nginx');
  assert.equal(detectTerminalQuickScriptQuery('x '), '');
  assert.equal(detectTerminalQuickScriptQuery('echo x nginx'), null);
  assert.equal(detectTerminalQuickScriptQuery('sudo x nginx'), null);
});

void test('findExactQuickScriptMatch prefers node script over global script', () => {
  const items: ScriptLibraryItem[] = [
    {
      id: 'global-1',
      key: 'restart-global',
      alias: 'restart',
      scope: 'global',
      nodeId: null,
      title: '全局重启',
      description: '',
      kind: 'plain',
      content: 'systemctl restart nginx',
      variables: [],
      tags: [],
      resolvedFrom: 'global',
      overridesGlobal: false,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'node-1',
      key: 'restart-node',
      alias: 'restart',
      scope: 'node',
      nodeId: 'node-1',
      title: '节点重启',
      description: '',
      kind: 'plain',
      content: 'service nginx restart',
      variables: [],
      tags: [],
      resolvedFrom: 'node',
      overridesGlobal: true,
      createdAt: '',
      updatedAt: '',
    },
  ];

  assert.equal(findExactQuickScriptMatch(items, 'restart')?.id, 'node-1');
});
