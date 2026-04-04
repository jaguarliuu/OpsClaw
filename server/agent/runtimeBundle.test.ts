import assert from 'node:assert/strict';
import test from 'node:test';

import { FileMemoryStore } from './fileMemoryStore.js';
import { OpsAgentRuntime } from './agentRuntime.js';
import { createAgentRuntimeBundle } from './runtimeBundle.js';
import { SessionRegistry } from './sessionRegistry.js';
import { ToolExecutor } from './toolExecutor.js';
import type { ToolRegistry } from './toolTypes.js';

type AgentRuntimeDependenciesView = {
  dependencies: {
    fileMemory: FileMemoryStore;
    sessions: SessionRegistry;
    toolRegistry: ToolRegistry;
    toolExecutor: ToolExecutor;
  };
};

function getRuntimeDependencies(runtime: OpsAgentRuntime) {
  return (runtime as unknown as AgentRuntimeDependenciesView).dependencies;
}

test('createAgentRuntimeBundle wires the default agent runtime dependencies', () => {
  const bundle = createAgentRuntimeBundle({
    getNodeById: () => null,
    getGroupById: () => null,
  });

  assert.ok(bundle.sessionRegistry instanceof SessionRegistry);
  assert.ok(bundle.fileMemoryStore instanceof FileMemoryStore);
  assert.ok(bundle.agentRuntime instanceof OpsAgentRuntime);
  const runtimeDependencies = getRuntimeDependencies(bundle.agentRuntime);

  assert.equal(runtimeDependencies.sessions, bundle.sessionRegistry);
  assert.equal(runtimeDependencies.fileMemory, bundle.fileMemoryStore);
  assert.ok(runtimeDependencies.toolExecutor instanceof ToolExecutor);
  assert.ok(runtimeDependencies.toolRegistry.get('session.list'));
  assert.ok(runtimeDependencies.toolRegistry.get('session.read_transcript'));
  assert.ok(runtimeDependencies.toolRegistry.get('memory.read_session_context'));
  assert.ok(runtimeDependencies.toolRegistry.get('memory.write_group_memory'));
});

test('createAgentRuntimeBundle reuses injected stores', () => {
  const sessionRegistry = new SessionRegistry();
  const fileMemoryStore = new FileMemoryStore();

  const bundle = createAgentRuntimeBundle({
    getNodeById: () => null,
    getGroupById: () => null,
    sessionRegistry,
    fileMemoryStore,
  });

  assert.equal(bundle.sessionRegistry, sessionRegistry);
  assert.equal(bundle.fileMemoryStore, fileMemoryStore);
  const runtimeDependencies = getRuntimeDependencies(bundle.agentRuntime);

  assert.equal(runtimeDependencies.sessions, sessionRegistry);
  assert.equal(runtimeDependencies.fileMemory, fileMemoryStore);
});
