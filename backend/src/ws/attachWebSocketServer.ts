import type http from 'node:http';
import { WebSocketServer } from 'ws';
import type { DashboardStore } from '../store/types.js';
import { SessionHub } from './SessionHub.js';
import { registerWsUpgrade } from './upgradeRouter.js';

export const WEB_WS_PATH = '/ws';

export function attachWebSocketServer(server: http.Server, _store: DashboardStore): SessionHub {
  const hub = new SessionHub();
  const wss = new WebSocketServer({ noServer: true });
  registerWsUpgrade(server, WEB_WS_PATH, wss);

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url ?? WEB_WS_PATH, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      socket.close(1008, 'sessionId required');
      return;
    }
    hub.subscribe(sessionId, socket);
  });

  return hub;
}
