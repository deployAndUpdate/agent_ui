import type http from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';

type UpgradeHandler = {
  path: string;
  wss: WebSocketServer;
};

const handlersByServer = new WeakMap<http.Server, UpgradeHandler[]>();
const listening = new WeakSet<http.Server>();

/**
 * Route HTTP upgrades to path-specific WebSocketServer instances (`noServer: true`).
 * Needed because multiple `new WebSocketServer({ server, path })` fight over upgrade:
 * the first mismatched path returns 400 and never reaches the second WSS.
 */
export function registerWsUpgrade(
  server: http.Server,
  path: string,
  wss: WebSocketServer,
): void {
  let handlers = handlersByServer.get(server);
  if (!handlers) {
    handlers = [];
    handlersByServer.set(server, handlers);
  }
  handlers.push({ path, wss });

  if (listening.has(server)) return;
  listening.add(server);

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const match = handlersByServer.get(server)?.find((h) => h.path === pathname);
    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    match.wss.handleUpgrade(req, socket as Duplex, head, (ws) => {
      match.wss.emit('connection', ws, req);
    });
  });
}
