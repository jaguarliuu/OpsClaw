import http from 'node:http';

import express from 'express';
import { WebSocketServer } from 'ws';

import { createAgentRuntimeBundle } from './agent/runtimeBundle.js';
import { createAppLockStore } from './appLockStore.js';
import { createCommandHistoryStore } from './commandHistoryStore.js';
import { registerOpsClawHttpApi } from './httpApi.js';
import { createLlmProviderStore } from './llmProviderStore.js';
import { runInspectionCommandOnNode } from './nodeInspectionRunner.js';
import { createNodeInspectionService, type RunInspectionCommand } from './nodeInspectionService.js';
import { createNodeInspectionStore } from './nodeInspectionStore.js';
import { createNodeStore } from './nodeStore.js';
import { createScriptLibraryStore } from './scriptLibraryStore.js';
import { createSftpConnectionManager } from './sftpConnectionManager.js';
import { createSftpService } from './sftpService.js';
import { createSftpStore } from './sftpStore.js';

export type CreateOpsClawServerAppOptions = {
  port?: number;
  runNodeInspectionCommand?: RunInspectionCommand;
};

export async function createOpsClawServerApp(options: CreateOpsClawServerAppOptions = {}) {
  const nodeStore = await createNodeStore();
  const commandHistoryStore = await createCommandHistoryStore();
  const llmProviderStore = await createLlmProviderStore();
  const scriptLibraryStore = await createScriptLibraryStore();
  const nodeInspectionStore = await createNodeInspectionStore();
  const sftpStore = await createSftpStore();
  const sftpConnectionManager = createSftpConnectionManager({
    nodeStore,
    sftpStore,
  });
  const sftpService = createSftpService({
    connectionManager: sftpConnectionManager,
  });
  const runNodeInspectionCommand: RunInspectionCommand =
    options.runNodeInspectionCommand ??
    ((node, command) => runInspectionCommandOnNode(node, command, (id) => nodeStore.getNodeWithSecrets(id)));
  const nodeInspectionService = createNodeInspectionService({
    nodeStore,
    scriptLibraryStore,
    inspectionStore: nodeInspectionStore,
    runInspectionCommand: runNodeInspectionCommand,
  });
  const { sessionRegistry, fileMemoryStore, agentRuntime } = createAgentRuntimeBundle({
    getNodeById: (id) => nodeStore.getNode(id),
    getGroupById: (id) => nodeStore.getGroup(id),
  });
  const appLockStore = await createAppLockStore();
  const app = express();
  const server = http.createServer(app);
  const websocketServer = new WebSocketServer({ noServer: true });
  const port = options.port ?? Number(process.env.PORT ?? 4000);

  registerOpsClawHttpApi(app, {
    nodeStore,
    commandHistoryStore,
    llmProviderStore,
    scriptLibraryStore,
    nodeInspectionStore,
    nodeInspectionService,
    sftpStore,
    sftpService,
    fileMemoryStore,
    agentRuntime,
    appLockStore,
  });

  return {
    app,
    server,
    websocketServer,
    port,
    nodeStore,
    scriptLibraryStore,
    nodeInspectionStore,
    nodeInspectionService,
    sftpStore,
    sftpConnectionManager,
    sftpService,
    sessionRegistry,
  };
}
