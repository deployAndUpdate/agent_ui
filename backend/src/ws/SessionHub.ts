import type { DashboardManifest } from '@visual-engine/shared';
import type { WebSocket } from 'ws';

export interface DashboardUpdateMessage {
  type: 'dashboard_update';
  sessionId: string;
  version: number;
  manifest: DashboardManifest;
}

export class SessionHub {
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

  publish(message: DashboardUpdateMessage): void {
    const set = this.sessions.get(message.sessionId);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) {
        socket.send(payload);
      }
    }
  }
}
