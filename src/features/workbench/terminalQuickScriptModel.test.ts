import assert from 'node:assert/strict';
import test from 'node:test';

import type { ScriptLibraryItem } from './types.js';

import {
  buildQuickScriptSuggestionItems,
  detectTerminalQuickScriptQuery,
  findExactQuickScriptMatch,
  rankQuickScriptCandidates,
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

void test('rankQuickScriptCandidates orders items by alias exact, scope, and alias lexicographic tie-breakers', () => {
  const items: readonly ScriptLibraryItem[] = [
    {
      id: 'global-exact',
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
      id: 'node-exact',
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
    {
      id: 'node-alpha',
      key: 'restart-alpha',
      alias: 'alpha',
      scope: 'node',
      nodeId: 'node-1',
      title: 'restart alpha',
      description: '',
      kind: 'plain',
      content: 'alpha command',
      variables: [],
      tags: [],
      resolvedFrom: 'node',
      overridesGlobal: false,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'node-beta',
      key: 'restart-beta',
      alias: 'beta',
      scope: 'node',
      nodeId: 'node-1',
      title: 'restart beta',
      description: '',
      kind: 'plain',
      content: 'beta command',
      variables: [],
      tags: [],
      resolvedFrom: 'node',
      overridesGlobal: false,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'global-charlie',
      key: 'restart-charlie',
      alias: 'charlie',
      scope: 'global',
      nodeId: null,
      title: 'restart charlie',
      description: '',
      kind: 'plain',
      content: 'charlie command',
      variables: [],
      tags: [],
      resolvedFrom: 'global',
      overridesGlobal: false,
      createdAt: '',
      updatedAt: '',
    },
  ];

  const ranked = rankQuickScriptCandidates(items, 'restart');

  assert.deepEqual(ranked.map((item) => item.id), [
    'node-exact',
    'global-exact',
    'node-alpha',
    'node-beta',
    'global-charlie',
  ]);
});

void test('buildQuickScriptSuggestionItems returns highlighted list items', () => {
  const items = buildQuickScriptSuggestionItems(
    [
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
      {
        id: 'global-1',
        key: 'logs-global',
        alias: 'logs',
        scope: 'global',
        nodeId: null,
        title: '查看日志',
        description: '',
        kind: 'plain',
        content: 'journalctl -n 200',
        variables: [],
        tags: [],
        resolvedFrom: 'global',
        overridesGlobal: false,
        createdAt: '',
        updatedAt: '',
      },
    ],
    0
  );

  assert.equal(items.length, 2);
  assert.equal(items[0]?.highlighted, true);
  assert.equal(items[0]?.label, 'restart');
});
