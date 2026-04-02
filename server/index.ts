import { createOpsClawServerApp } from './serverApp.js';
import { registerTerminalGateway } from './terminalGateway.js';

type StartOpsClawServerOptions = {
  port?: number;
};

export async function startOpsClawServer(options: StartOpsClawServerOptions = {}) {
  const { server, websocketServer, port, nodeStore, sessionRegistry } =
    await createOpsClawServerApp(options);

  registerTerminalGateway({
    server,
    websocketServer,
    nodeStore,
    sessionRegistry,
  });

  server.listen(port, () => {
    console.log(`OpsClaw SSH gateway listening on http://localhost:${port}`);
  });
}

void startOpsClawServer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
