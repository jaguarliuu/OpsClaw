import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const originalCwd = process.cwd();

let tempRoot = '';

test.before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opsclaw-script-library-'));
  process.chdir(tempRoot);
});

test.after(async () => {
  const { getSqliteDatabase } = await import('./database.js');
  const sqlite = await getSqliteDatabase();
  await sqlite.close();
  process.chdir(originalCwd);
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

void test('listResolvedScripts merges global and node scripts by alias precedence', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  store.createScript({
    key: 'restart-nginx-global',
    alias: 'restart-nginx-global',
    scope: 'global',
    nodeId: null,
    title: '重启 Nginx',
    description: '全局脚本',
    kind: 'plain',
    content: 'sudo systemctl restart nginx',
    variables: [],
    tags: ['ops'],
  });

  store.createScript({
    key: 'restart-nginx-global',
    alias: 'restart-nginx-global',
    scope: 'node',
    nodeId: 'node-1',
    title: '重启 Nginx（节点覆盖）',
    description: '节点覆盖脚本',
    kind: 'plain',
    content: 'sudo service nginx restart',
    variables: [],
    tags: ['ops', 'override'],
  });

  store.createScript({
    key: 'disk-usage-global',
    alias: 'disk-usage-global',
    scope: 'global',
    nodeId: null,
    title: '磁盘占用',
    description: '',
    kind: 'plain',
    content: 'df -h',
    variables: [],
    tags: ['inspect'],
  });

  const nodeItems = store.listResolvedScripts('node-1');
  const defaultItems = store.listResolvedScripts();

  assert.equal(nodeItems.length, 2);
  assert.equal(nodeItems[0]?.key, 'disk-usage-global');
  assert.equal(nodeItems[0]?.resolvedFrom, 'global');
  assert.equal(nodeItems[0]?.overridesGlobal, false);
  assert.equal(nodeItems[1]?.key, 'restart-nginx-global');
  assert.equal(nodeItems[1]?.resolvedFrom, 'node');
  assert.equal(nodeItems[1]?.overridesGlobal, true);
  assert.equal(nodeItems[1]?.content, 'sudo service nginx restart');

  assert.equal(defaultItems.length, 2);
  assert.equal(defaultItems[1]?.resolvedFrom, 'global');
});

void test('createScript and updateScript preserve template variables and tags', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  const created = store.createScript({
    key: 'service-restart-template',
    alias: 'service-restart-template',
    scope: 'global',
    nodeId: null,
    title: '服务重启模板',
    description: '按服务名重启',
    kind: 'template',
    content: 'sudo systemctl restart ${service}',
    variables: [
      {
        name: 'service',
        label: '服务名',
        inputType: 'text',
        required: true,
        defaultValue: 'nginx',
        placeholder: 'nginx',
      },
    ],
    tags: ['ops', 'template'],
  });

  assert.equal(created.kind, 'template');
  assert.equal(created.variables.length, 1);
  assert.equal(created.variables[0]?.name, 'service');
  assert.deepEqual(created.tags, ['ops', 'template']);

  const updated = store.updateScript(created.id, {
    title: '服务重启模板（已更新）',
    description: '更新后的描述',
    content: 'sudo service ${service} restart',
    tags: ['ops', 'template', 'v2'],
  });

  assert.ok(updated);
  assert.equal(updated?.title, '服务重启模板（已更新）');
  assert.equal(updated?.description, '更新后的描述');
  assert.equal(updated?.content, 'sudo service ${service} restart');
  assert.deepEqual(updated?.tags, ['ops', 'template', 'v2']);
  assert.equal(updated?.variables[0]?.defaultValue, 'nginx');
});

void test('deleteScript removes the persisted item', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  const created = store.createScript({
    key: 'delete-me-script',
    alias: 'delete-me-script',
    scope: 'global',
    nodeId: null,
    title: '待删除脚本',
    description: '',
    kind: 'plain',
    content: 'echo delete-me',
    variables: [],
    tags: [],
  });

  const beforeDelete = store.listResolvedScripts();
  assert.ok(beforeDelete.some((item) => item.id === created.id));

  store.deleteScript(created.id);

  const afterDelete = store.listResolvedScripts();
  assert.equal(afterDelete.some((item) => item.id === created.id), false);
});

void test('createScript persists alias and listResolvedScripts returns it', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  store.createScript({
    key: 'disk-usage',
    alias: 'disk',
    scope: 'global',
    nodeId: null,
    title: '查看磁盘',
    description: '查看磁盘占用',
    kind: 'plain',
    content: 'df -h',
    variables: [],
    tags: ['ops'],
  });

  const [item] = store.listResolvedScripts();
  assert.equal(item?.alias, 'disk');
});

void test('node alias overrides global alias during resolved lookup', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  store.createScript({
    key: 'restart-global-resolved',
    alias: 'restart-resolved',
    scope: 'global',
    nodeId: null,
    title: '全局重启',
    description: '',
    kind: 'plain',
    content: 'systemctl restart nginx',
    variables: [],
    tags: [],
  });

  store.createScript({
    key: 'restart-node-resolved',
    alias: 'restart-resolved',
    scope: 'node',
    nodeId: 'node-1',
    title: '节点重启',
    description: '',
    kind: 'plain',
    content: 'service nginx restart',
    variables: [],
    tags: [],
  });

  const [resolved] = store.listResolvedScripts('node-1').filter((item) => item.alias === 'restart-resolved');
  assert.equal(resolved?.resolvedFrom, 'node');
  assert.equal(resolved?.content, 'service nginx restart');
});

void test('listManagedScripts returns global and node scripts without resolved merging', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  store.createScript({
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
  });

  store.createScript({
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
  });

  const items = store.listManagedScripts();
  const managedRestartItems = items.filter((item) => item.alias === 'restart');

  assert.equal(managedRestartItems.length, 2);
  assert.equal(
    managedRestartItems.some((item) => item.scope === 'global' && item.alias === 'restart'),
    true
  );
  assert.equal(
    managedRestartItems.some((item) => item.scope === 'node' && item.nodeId === 'node-1'),
    true
  );
});

void test('global script listings ignore inconsistent global rows with non-null node ids', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const { getSqliteDatabase } = await import('./database.js');
  const store = await createScriptLibraryStore();
  const sqlite = await getSqliteDatabase();
  const now = new Date().toISOString();

  store.createScript({
    key: 'healthy-global',
    alias: 'healthy-global',
    scope: 'global',
    nodeId: null,
    title: 'Healthy global',
    description: '',
    kind: 'plain',
    content: 'echo healthy',
    variables: [],
    tags: [],
  });

  sqlite.database.run(
    `
      INSERT INTO script_library (
        id, key, alias, scope, node_id, title, description, kind, content,
        variables_json, tags_json, created_at, updated_at
      ) VALUES (
        'corrupt-global-row',
        'corrupt-global',
        'corrupt-global',
        'global',
        'node-legacy',
        'Corrupt global',
        '',
        'plain',
        'echo corrupt',
        '[]',
        '[]',
        :createdAt,
        :updatedAt
      )
    `,
    {
      ':createdAt': now,
      ':updatedAt': now,
    }
  );

  const resolvedAliases = store.listResolvedScripts().map((item) => item.alias);
  const managedGlobalAliases = store
    .listManagedScripts({ scope: 'global' })
    .map((item) => item.alias);

  assert.equal(resolvedAliases.includes('healthy-global'), true);
  assert.equal(managedGlobalAliases.includes('healthy-global'), true);
  assert.equal(resolvedAliases.includes('corrupt-global'), false);
  assert.equal(managedGlobalAliases.includes('corrupt-global'), false);
});

void test('createScript rejects invalid alias format', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  assert.throws(
    () =>
      store.createScript({
        key: 'invalid-alias-script',
        alias: 'Invalid Alias',
        scope: 'global',
        nodeId: null,
        title: '别名不合法',
        description: '',
        kind: 'plain',
        content: 'echo invalid',
        variables: [],
        tags: [],
      }),
    /脚本 alias 只能包含小写字母、数字、-、_。/
  );
});

void test('createScript rejects duplicate alias within same scope layer', async () => {
  const { createScriptLibraryStore } = await import('./scriptLibraryStore.js');
  const store = await createScriptLibraryStore();

  store.createScript({
    key: 'global-1',
    alias: 'dup-global',
    scope: 'global',
    nodeId: null,
    title: 'global 1',
    description: '',
    kind: 'plain',
    content: 'echo 1',
    variables: [],
    tags: [],
  });

  assert.throws(
    () =>
      store.createScript({
        key: 'global-2',
        alias: 'dup-global',
        scope: 'global',
        nodeId: null,
        title: 'global 2',
        description: '',
        kind: 'plain',
        content: 'echo 2',
        variables: [],
        tags: [],
      }),
    /脚本 alias 已存在。/
  );

  store.createScript({
    key: 'node-1-script-1',
    alias: 'dup-node',
    scope: 'node',
    nodeId: 'node-1',
    title: 'node 1 script 1',
    description: '',
    kind: 'plain',
    content: 'echo node1-1',
    variables: [],
    tags: [],
  });

  assert.throws(
    () =>
      store.createScript({
        key: 'node-1-script-2',
        alias: 'dup-node',
        scope: 'node',
        nodeId: 'node-1',
        title: 'node 1 script 2',
        description: '',
        kind: 'plain',
        content: 'echo node1-2',
        variables: [],
        tags: [],
      }),
    /脚本 alias 已存在。/
  );
});
