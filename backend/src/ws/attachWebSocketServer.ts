import type http from 'node:http';
import { WebSocketServer } from 'ws';
import type { DashboardStore } from '../store/types.js';
import { SessionHub } from './SessionHub.js';

export function attachWebSocketServer(server: http.Server, _store: DashboardStore): SessionHub {
  const hub = new SessionHub();
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url ?? '/ws', 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      socket.close(1008, 'sessionId required');
      return;
    }
    hub.subscribe(sessionId, socket);
  });

  return hub;
}
