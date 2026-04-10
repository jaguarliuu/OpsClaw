import assert from 'node:assert/strict';
import test from 'node:test';

import type { ScriptLibraryItem } from './types.js';

import {
  buildQuickScriptCandidates,
  buildQuickScriptCompletion,
  buildQuickScriptSuggestionItems,
  detectTerminalQuickScriptQuery,
  findExactQuickScriptMatch,
  isQuickScriptQueryStillCurrent,
  rankQuickScriptCandidates,
  resolveTerminalDashboardShortcut,
  resolveQuickScriptExecutionTarget,
} from './terminalQuickScriptModel.js';

void test('detectTerminalQuickScriptQuery only matches whole-line x prefix', () => {
  assert.equal(detectTerminalQuickScriptQuery('x nginx'), 'nginx');
  assert.equal(detectTerminalQuickScriptQuery('x '), '');
  assert.equal(detectTerminalQuickScriptQuery('echo x nginx'), null);
  assert.equal(detectTerminalQuickScriptQuery('sudo x nginx'), null);
});

void test('resolveTerminalDashboardShortcut treats x dashboard as a dashboard action instead of a script alias', () => {
  assert.equal(resolveTerminalDashboardShortcut('x dashboard'), true);
  assert.equal(resolveTerminalDashboardShortcut('x Dashboard'), true);
  assert.equal(resolveTerminalDashboardShortcut('  x dashboard  '), true);
  assert.equal(detectTerminalQuickScriptQuery('x dashboard'), null);
  assert.equal(resolveTerminalDashboardShortcut('x dashboard now'), false);
});

void test('buildQuickScriptCandidates includes the builtin dashboard action in x suggestions', () => {
  const candidates = buildQuickScriptCandidates([], 'dash');

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.label, 'dashboard');
  assert.equal(candidates[0]?.kind, 'builtin');
  assert.equal(candidates[0]?.builtinAction, 'dashboard');
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
      usage: 'quick_run',
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
      usage: 'quick_run',
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
      usage: 'quick_run',
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
      usage: 'quick_run',
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
      usage: 'quick_run',
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
      usage: 'quick_run',
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
      usage: 'quick_run',
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
        kind: 'builtin',
        id: 'builtin-dashboard',
        label: 'dashboard',
        detail: '节点状态面板 · 内置',
        builtinAction: 'dashboard',
      },
      {
        kind: 'script',
        id: 'node-1',
        label: 'restart',
        detail: '节点重启 · node · plain',
        script: {
          id: 'node-1',
          key: 'restart-node',
          alias: 'restart',
          scope: 'node',
          nodeId: 'node-1',
          title: '节点重启',
          description: '',
          kind: 'plain',
          usage: 'quick_run',
          content: 'service nginx restart',
          variables: [],
          tags: [],
          resolvedFrom: 'node',
          overridesGlobal: true,
          createdAt: '',
          updatedAt: '',
        },
      },
      {
        kind: 'script',
        id: 'global-1',
        label: 'logs',
        detail: '查看日志 · global · plain',
        script: {
          id: 'global-1',
          key: 'logs-global',
          alias: 'logs',
          scope: 'global',
          nodeId: null,
          title: '查看日志',
          description: '',
          kind: 'plain',
          usage: 'quick_run',
          content: 'journalctl -n 200',
          variables: [],
          tags: [],
          resolvedFrom: 'global',
          overridesGlobal: false,
          createdAt: '',
          updatedAt: '',
        },
      },
    ],
    0
  );

  assert.equal(items.length, 3);
  assert.equal(items[0]?.highlighted, true);
  assert.equal(items[0]?.label, 'dashboard');
});

void test('isQuickScriptQueryStillCurrent validates current input buffer against expected query', () => {
  assert.equal(isQuickScriptQueryStillCurrent('x rest', 'res'), false);
  assert.equal(isQuickScriptQueryStillCurrent('x rest', 'rest'), true);
  assert.equal(isQuickScriptQueryStillCurrent('ls -la', 'rest'), false);
});

void test('resolveQuickScriptExecutionTarget ignores stale ranked candidates from a previous query', () => {
  const items: readonly ScriptLibraryItem[] = [
    {
      id: 'restart-node',
      key: 'restart-node',
      alias: 'restart',
      scope: 'node',
      nodeId: 'node-1',
      title: '节点重启',
      description: '',
      kind: 'plain',
      usage: 'quick_run',
      content: 'service nginx restart',
      variables: [],
      tags: ['service'],
      resolvedFrom: 'node',
      overridesGlobal: false,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'logs-global',
      key: 'logs-global',
      alias: 'logs',
      scope: 'global',
      nodeId: null,
      title: '查看日志',
      description: '',
      kind: 'plain',
      usage: 'quick_run',
      content: 'journalctl -n 200',
      variables: [],
      tags: ['debug'],
      resolvedFrom: 'global',
      overridesGlobal: false,
      createdAt: '',
      updatedAt: '',
    },
  ];

  const target = resolveQuickScriptExecutionTarget({
    query: 'res',
    items,
    rankedQuery: 'logs',
    rankedItems: buildQuickScriptCandidates(items, 'logs'),
    selectedIndex: 0,
  });

  assert.equal(target?.id, 'restart-node');
});

void test('resolveQuickScriptExecutionTarget resolves builtin dashboard when it is the selected x candidate', () => {
  const target = resolveQuickScriptExecutionTarget({
    query: 'dash',
    items: [],
    rankedQuery: 'dash',
    rankedItems: buildQuickScriptCandidates([], 'dash'),
    selectedIndex: 0,
  });

  assert.equal(target?.kind, 'builtin');
  assert.equal(target?.builtinAction, 'dashboard');
});

void test('buildQuickScriptCompletion completes builtin dashboard from a partial x query', () => {
  const completion = buildQuickScriptCompletion({
    inputBuffer: 'x dash',
    items: [],
    rankedQuery: 'dash',
    rankedItems: buildQuickScriptCandidates([], 'dash'),
    selectedIndex: 0,
  });

  assert.deepEqual(completion, {
    completedInput: 'x dashboard',
    forwardedInput: 'board',
  });
});
