import http from 'node:http';

import express from 'express';
import { WebSocketServer } from 'ws';

import { createAgentRuntimeBundle } from './agent/runtimeBundle.js';
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
  const { sessionRegistry, fileMemoryStore, agentRuntime } = createAgentRuntimeBundle({
    getNodeById: (id) => nodeStore.getNode(id),
    getGroupById: (id) => nodeStore.getGroup(id),
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
