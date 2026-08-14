import type http from 'node:http';
import { WebSocketServer } from 'ws';
import type { TuiStore } from '../store/types.js';
import type { Logger } from '../../logging/logger.js';
import { createLogger } from '../../logging/logger.js';
import { registerWsUpgrade } from '../../ws/upgradeRouter.js';
import { TuiSessionHub } from './TuiSessionHub.js';

export const TUI_WS_PATH = '/api/v1/tui/stream';

export function attachTuiWebSocket(
  server: http.Server,
  store: TuiStore,
  logger?: Logger,
): TuiSessionHub {
  const log = logger ?? createLogger('info', { component: 'tui-ws' });
  const hub = new TuiSessionHub();
  const wss = new WebSocketServer({ noServer: true });
  registerWsUpgrade(server, TUI_WS_PATH, wss);

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url ?? TUI_WS_PATH, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      socket.close(1008, 'sessionId required');
      return;
    }

    hub.subscribe(sessionId, socket);
    log.info({ sessionId }, 'tui client connected');

    void store.getSession(sessionId).then((snapshot) => {
      if (snapshot && socket.readyState === socket.OPEN) {
        socket.send(
          JSON.stringify({
            event: 'RENDER_MANIFEST',
            payload: snapshot.manifest,
          }),
        );
      }
    });

    hub.onUserAction(socket, async (action) => {
      await store.recordAction(sessionId, action);
      log.info(
        { sessionId, taskId: action.taskId, widgetId: action.widgetId, action: action.action },
        'tui USER_ACTION',
      );
    });
  });

  return hub;
}
