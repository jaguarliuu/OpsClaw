import assert from 'node:assert/strict';
import test from 'node:test';

import type { EffectiveOpsClawRules } from '../controlledExecutionTypes.js';
import type { MemoryDocument } from '../fileMemoryStore.js';
import { createToolRegistry } from '../toolRegistry.js';
import type { ToolExecutionContext } from '../toolTypes.js';
import type { StoredNodeDetail } from '../../nodeStore.js';
import { createFileMemoryToolProvider } from './fileMemoryProvider.js';

const DEFAULT_EFFECTIVE_RULES: EffectiveOpsClawRules = {
  intents: {},
};

function createMemoryDocument(
  scope: MemoryDocument['scope'],
  id: string | null,
  title: string,
  content = '',
  exists = true
): MemoryDocument {
  return {
    scope,
    id,
    title,
    path: '/tmp/MEMORY.md',
    content,
    exists,
    updatedAt: exists ? '2026-01-01T00:00:00.000Z' : null,
  };
}

function createNodeDetail(): StoredNodeDetail {
  return {
    id: 'node-1',
    name: 'Node One',
    groupId: 'group-1',
    groupName: '默认',
    jumpHostId: null,
    host: '10.0.0.8',
    port: 22,
    username: 'ubuntu',
    authMode: 'password',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    password: null,
    privateKey: null,
    passphrase: null,
    hasPassword: false,
    hasPrivateKey: false,
    hasPassphrase: false,
  };
}

function createFileMemoryCapability(
  overrides?: Partial<ToolExecutionContext['capabilities']['fileMemory']>
): ToolExecutionContext['capabilities']['fileMemory'] {
  return {
    readGlobalMemory: async () => createMemoryDocument('global', null, '全局记忆', '', false),
    writeGlobalMemory: async (content: string) =>
      createMemoryDocument('global', null, '全局记忆', content),
    readNodeMemory: async () => createMemoryDocument('node', 'node-1', '节点记忆 · Node One', '', false),
    writeNodeMemory: async (_nodeId: string, _nodeName: string, content: string) =>
      createMemoryDocument('node', 'node-1', '节点记忆 · Node One', content),
    appendNodeMemory: async (_nodeId: string, _nodeName: string, content: string) =>
      createMemoryDocument('node', 'node-1', '节点记忆 · Node One', content),
    readGroupMemory: async () => null,
    writeGroupMemory: async (_groupId: string, _groupName: string, content: string) =>
      createMemoryDocument('group', 'group-1', '分组记忆 · 默认', content),
    appendGroupMemory: async (_groupId: string, _groupName: string, content: string) =>
      createMemoryDocument('group', 'group-1', '分组记忆 · 默认', content),
    appendAutoNodeMemoryEntry: async (_nodeId: string, _nodeName: string, content: string) =>
      createMemoryDocument('node', 'node-1', '节点记忆 · Node One', content),
    appendAutoGroupMemoryEntry: async (_groupId: string, _groupName: string, content: string) =>
      createMemoryDocument('group', 'group-1', '分组记忆 · 默认', content),
    ...overrides,
  } as ToolExecutionContext['capabilities']['fileMemory'];
}

function createExecutionContext(overrides?: Partial<ToolExecutionContext>): ToolExecutionContext {
  return {
    runId: 'run-1',
    userTask: '写入节点记忆',
    sessionId: 'session-1',
    sessionGroupName: null,
    step: 1,
    approvalMode: 'auto-readonly',
    maxCommandOutputChars: 4000,
    effectiveRules: DEFAULT_EFFECTIVE_RULES,
    signal: new AbortController().signal,
    capabilities: {
      sessions: {
        getSession(sessionId: string) {
          return {
            sessionId,
            nodeId: 'node-1',
            host: '10.0.0.8',
            port: 22,
            username: 'ubuntu',
            status: 'connected' as const,
          };
        },
      } as ToolExecutionContext['capabilities']['sessions'],
      fileMemory: createFileMemoryCapability(),
    },
    emit() {},
    ...overrides,
  };
}

test('memory.write_node_memory falls back to the current session node when nodeId is omitted', async () => {
  const appendCalls: Array<{ nodeId: string; nodeName: string; content: string }> = [];
  const registry = createToolRegistry();
  registry.registerProvider(
    createFileMemoryToolProvider({
      getNodeById(nodeId) {
        if (nodeId !== 'node-1') {
          return null;
        }

        return createNodeDetail();
      },
      getGroupById() {
        return null;
      },
    })
  );

  const handler = registry.get('memory.write_node_memory');
  assert.ok(handler);

  const result = (await handler.execute(
    {
      content: '### 新的稳定观察',
      mode: 'append',
    },
    createExecutionContext({
      capabilities: {
        sessions: {
          getSession(sessionId: string) {
            return {
              sessionId,
              nodeId: 'node-1',
              host: '10.0.0.8',
              port: 22,
              username: 'ubuntu',
              status: 'connected' as const,
            };
          },
        } as ToolExecutionContext['capabilities']['sessions'],
        fileMemory: createFileMemoryCapability({
          appendNodeMemory: async (nodeId: string, nodeName: string, content: string) => {
            appendCalls.push({ nodeId, nodeName, content });
            return createMemoryDocument('node', nodeId, `节点记忆 · ${nodeName}`, content);
          },
        }),
      },
    })
  )) as MemoryDocument;

  assert.deepEqual(appendCalls, [
    {
      nodeId: 'node-1',
      nodeName: 'Node One',
      content: '### 新的稳定观察',
    },
  ]);
  assert.equal(result.exists, true);
});

test('memory.write_node_memory rejects omitted nodeId when the current session is not bound to a node', async () => {
  const registry = createToolRegistry();
  registry.registerProvider(
    createFileMemoryToolProvider({
      getNodeById() {
        return null;
      },
      getGroupById() {
        return null;
      },
    })
  );

  const handler = registry.get('memory.write_node_memory');
  assert.ok(handler);

  await assert.rejects(
    () =>
      handler.execute(
        {
          content: '### 新的稳定观察',
        },
        createExecutionContext({
          capabilities: {
            sessions: {
              getSession(sessionId: string) {
                return {
                  sessionId,
                  nodeId: null,
                  host: '10.0.0.8',
                  port: 22,
                  username: 'ubuntu',
                  status: 'connected' as const,
                };
              },
            } as ToolExecutionContext['capabilities']['sessions'],
            fileMemory: createFileMemoryCapability(),
          },
        })
      ),
    /当前会话未绑定节点/
  );
});
