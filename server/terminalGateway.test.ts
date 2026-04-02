import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

type UpgradeRequest = {
  url?: string;
};

class FakeSocket {
  destroyed = false;

  destroy() {
    this.destroyed = true;
  }
}

class FakeWebSocket extends EventEmitter {
  public readyState = 1;
  public sent: string[] = [];
  public terminated = false;

  send(message: string) {
    this.sent.push(message);
  }

  ping() {}

  terminate() {
    this.terminated = true;
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }
}

class FakeWebSocketServer extends EventEmitter {
  public handleUpgradeCalls: Array<{ request: UpgradeRequest; socket: FakeSocket; head: Buffer }> = [];
  public createdWebsockets: FakeWebSocket[] = [];

  handleUpgrade(request: UpgradeRequest, socket: FakeSocket, head: Buffer, callback: (websocket: FakeWebSocket) => void) {
    const websocket = new FakeWebSocket();
    this.handleUpgradeCalls.push({ request, socket, head });
    this.createdWebsockets.push(websocket);
    callback(websocket);
  }
}

void test('registerTerminalGateway only upgrades terminal websocket requests', async () => {
  const { registerTerminalGateway } = await import('./terminalGateway.js');

  const server = new EventEmitter();
  const websocketServer = new FakeWebSocketServer();

  registerTerminalGateway({
    server: server as never,
    websocketServer: websocketServer as never,
    nodeStore: { getNodeWithSecrets() { return null; } } as never,
    sessionRegistry: {
      unregisterSession() {},
      registerSession() {},
      updateSessionStatus() {},
      appendTerminalData() {},
    } as never,
  });

  const ignoredSocket = new FakeSocket();
  server.emit('upgrade', { url: '/not-terminal' } satisfies UpgradeRequest, ignoredSocket, Buffer.alloc(0));
  assert.equal(ignoredSocket.destroyed, true);
  assert.equal(websocketServer.handleUpgradeCalls.length, 0);

  const acceptedSocket = new FakeSocket();
  server.emit('upgrade', { url: '/ws/terminal?sessionId=s1' } satisfies UpgradeRequest, acceptedSocket, Buffer.alloc(0));
  assert.equal(acceptedSocket.destroyed, false);
  assert.equal(websocketServer.handleUpgradeCalls.length, 1);
  websocketServer.createdWebsockets[0]?.close();
});

void test('registerTerminalGateway returns an error message for invalid websocket payloads', async () => {
  const { registerTerminalGateway } = await import('./terminalGateway.js');

  const server = new EventEmitter();
  const websocketServer = new FakeWebSocketServer();

  registerTerminalGateway({
    server: server as never,
    websocketServer: websocketServer as never,
    nodeStore: { getNodeWithSecrets() { return null; } } as never,
    sessionRegistry: {
      unregisterSession() {},
      registerSession() {},
      updateSessionStatus() {},
      appendTerminalData() {},
    } as never,
  });

  server.emit('upgrade', { url: '/ws/terminal' } satisfies UpgradeRequest, new FakeSocket(), Buffer.alloc(0));
  const createdWebsocket = new FakeWebSocket();
  websocketServer.emit('connection', createdWebsocket);

  createdWebsocket.emit('message', Buffer.from('{invalid-json'));

  assert.equal(createdWebsocket.sent.length, 1);
  assert.deepEqual(JSON.parse(createdWebsocket.sent[0] ?? '{}'), {
    type: 'error',
    payload: { message: 'Invalid terminal message payload.' },
  });
  createdWebsocket.close();
  websocketServer.createdWebsockets[0]?.close();
});
