import http from 'node:http';

import express from 'express';
import { WebSocketServer } from 'ws';

import { OpsAgentRuntime } from './agent/agentRuntime.js';
import { FileMemoryStore } from './agent/fileMemoryStore.js';
import { SessionRegistry } from './agent/sessionRegistry.js';
import { createFileMemoryToolProvider } from './agent/tools/fileMemoryProvider.js';
import { sessionToolProvider } from './agent/tools/sessionProvider.js';
import { ToolExecutor } from './agent/toolExecutor.js';
import { createToolRegistry } from './agent/toolRegistry.js';
import { createCommandHistoryStore } from './commandHistoryStore.js';
import { registerOpsClawHttpApi } from './httpApi.js';
import { createLlmProviderStore } from './llmProviderStore.js';
import { createNodeStore } from './nodeStore.js';
import { createScriptLibraryStore } from './scriptLibraryStore.js';

export type CreateOpsClawServerAppOptions = {
  port?: number;
};

export async function createOpsClawServerApp(options: CreateOpsClawServerAppOptions = {}) {
  const nodeStore = await createNodeStore();
  const commandHistoryStore = await createCommandHistoryStore();
  const llmProviderStore = await createLlmProviderStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const sessionRegistry = new SessionRegistry();
  const fileMemoryStore = new FileMemoryStore();
  const toolRegistry = createToolRegistry();
  toolRegistry.registerProvider(sessionToolProvider);
  toolRegistry.registerProvider(
    createFileMemoryToolProvider({
      getNodeById: (id) => nodeStore.getNode(id),
      getGroupById: (id) => nodeStore.getGroup(id),
    })
  );
  const toolExecutor = new ToolExecutor(toolRegistry);
  const agentRuntime = new OpsAgentRuntime({
    toolRegistry,
    toolExecutor,
    fileMemory: fileMemoryStore,
    getNodeById: (id) => nodeStore.getNode(id),
    sessions: sessionRegistry,
  });
  const app = express();
  const server = http.createServer(app);
  const websocketServer = new WebSocketServer({ noServer: true });
  const port = options.port ?? Number(process.env.PORT ?? 4000);

  registerOpsClawHttpApi(app, {
    nodeStore,
    commandHistoryStore,
    llmProviderStore,
    scriptLibraryStore,
    fileMemoryStore,
    agentRuntime,
  });

  return {
    app,
    server,
    websocketServer,
    port,
    nodeStore,
    sessionRegistry,
  };
}
