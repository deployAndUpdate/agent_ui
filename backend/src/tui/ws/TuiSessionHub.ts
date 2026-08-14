import type { TuiManifest, TuiUserAction } from '@visual-engine/tui-shared';
import type { WebSocket } from 'ws';

export interface TuiRenderMessage {
  event: 'RENDER_MANIFEST';
  payload: TuiManifest;
}

export class TuiSessionHub {
  private sessions = new Map<string, Set<WebSocket>>();

  subscribe(sessionId: string, socket: WebSocket): void {
    let set = this.sessions.get(sessionId);
    if (!set) {
      set = new Set();
      this.sessions.set(sessionId, set);
    }
    set.add(socket);
    socket.on('close', () => {
      set?.delete(socket);
      if (set && set.size === 0) this.sessions.delete(sessionId);
    });
  }

  publish(sessionId: string, message: TuiRenderMessage): void {
    const set = this.sessions.get(sessionId);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }

  onUserAction(
    socket: WebSocket,
    handler: (action: TuiUserAction) => void | Promise<void>,
  ): void {
    socket.on('message', (raw) => {
      void (async () => {
        try {
          const text = typeof raw === 'string' ? raw : raw.toString('utf8');
          const parsed = JSON.parse(text) as Partial<TuiUserAction>;
          if (
            parsed?.event !== 'USER_ACTION' ||
            typeof parsed.taskId !== 'string' ||
            typeof parsed.widgetId !== 'string' ||
            typeof parsed.action !== 'string' ||
            typeof parsed.payload !== 'object' ||
            parsed.payload === null
          ) {
            return;
          }
          await handler(parsed as TuiUserAction);
        } catch {
          // ignore malformed client frames
        }
      })();
    });
  }
}
