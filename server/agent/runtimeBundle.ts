import type { GroupSummary, StoredNodeDetail } from '../nodeStore.js';
import {
  OpsAgentRuntime,
} from './agentRuntime.js';
import { FileMemoryStore } from './fileMemoryStore.js';
import { SessionRegistry } from './sessionRegistry.js';
import { createFileMemoryToolProvider } from './tools/fileMemoryProvider.js';
import { sessionToolProvider } from './tools/sessionProvider.js';
import { ToolExecutor } from './toolExecutor.js';
import { createToolRegistry } from './toolRegistry.js';

export type CreateAgentRuntimeBundleOptions = {
  getNodeById: (id: string) => StoredNodeDetail | null;
  getGroupById: (id: string) => Pick<GroupSummary, 'id' | 'name'> | null;
  sessionRegistry?: SessionRegistry;
  fileMemoryStore?: FileMemoryStore;
};

export type AgentRuntimeBundle = {
  sessionRegistry: SessionRegistry;
  fileMemoryStore: FileMemoryStore;
  agentRuntime: OpsAgentRuntime;
};

export function createAgentRuntimeBundle(
  options: CreateAgentRuntimeBundleOptions
): AgentRuntimeBundle {
  const sessionRegistry = options.sessionRegistry ?? new SessionRegistry();
  const fileMemoryStore = options.fileMemoryStore ?? new FileMemoryStore();
  const toolRegistry = createToolRegistry();

  toolRegistry.registerProvider(sessionToolProvider);
  toolRegistry.registerProvider(
    createFileMemoryToolProvider({
      getNodeById: options.getNodeById,
      getGroupById: options.getGroupById,
    })
  );

  const toolExecutor = new ToolExecutor(toolRegistry);
  const agentRuntime = new OpsAgentRuntime({
    toolRegistry,
    toolExecutor,
    fileMemory: fileMemoryStore,
    getNodeById: options.getNodeById,
    sessions: sessionRegistry,
  });

  return {
    sessionRegistry,
    fileMemoryStore,
    agentRuntime,
  };
}
