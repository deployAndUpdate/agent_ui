import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardManifest, WidgetInteractionEvent } from '@visual-engine/shared';
import {
  fetchDashboard,
  postWidgetInteraction,
  type DashboardUpdateMessage,
} from '../api/client';

export interface UseDashboardSessionOptions {
  sessionId: string;
  apiBase?: string;
  wsBase?: string;
  apiKey?: string;
  /** reconnect backoff base ms */
  reconnectBaseMs?: number;
  maxReconnectMs?: number;
}

export interface UseDashboardSessionState {
  manifest: DashboardManifest | null;
  version: number;
  status: 'idle' | 'loading' | 'live' | 'reconnecting' | 'error';
  error: string | null;
  interactions: WidgetInteractionEvent[];
  sendInteraction: (event: WidgetInteractionEvent) => Promise<void>;
  refresh: () => Promise<void>;
}

function toWsUrl(wsBase: string, sessionId: string): string {
  const base =
    wsBase ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
      : 'ws://localhost:3001');
  const url = new URL('/ws', base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('sessionId', sessionId);
  return url.toString();
}

export function useDashboardSession(options: UseDashboardSessionOptions): UseDashboardSessionState {
  const {
    sessionId,
    apiBase = '',
    wsBase = '',
    apiKey,
    reconnectBaseMs = 500,
    maxReconnectMs = 8000,
  } = options;

  const [manifest, setManifest] = useState<DashboardManifest | null>(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<UseDashboardSessionState['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<WidgetInteractionEvent[]>([]);
  const attemptRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const closedRef = useRef(false);

  const applyUpdate = useCallback((nextVersion: number, nextManifest: DashboardManifest) => {
    setVersion((prev) => {
      if (nextVersion < prev) return prev;
      setManifest(nextManifest);
      return nextVersion;
    });
  }, []);

  const refresh = useCallback(async () => {
    setStatus((s) => (s === 'live' ? s : 'loading'));
    try {
      const snap = await fetchDashboard(sessionId, apiBase, apiKey);
      if (snap) {
        applyUpdate(snap.version, snap.manifest);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'refresh failed');
      setStatus('error');
    }
  }, [sessionId, apiBase, apiKey, applyUpdate]);

  const sendInteraction = useCallback(
    async (event: WidgetInteractionEvent) => {
      setInteractions((prev) => [event, ...prev]);
      await postWidgetInteraction(event, apiBase, apiKey);
    },
    [apiBase, apiKey],
  );

  useEffect(() => {
    closedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedRef.current) return;
      const ws = new WebSocket(toWsUrl(wsBase, sessionId));
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus('live');
        setError(null);
        void refresh();
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(String(msg.data)) as DashboardUpdateMessage;
          if (data.type === 'dashboard_update' && data.sessionId === sessionId) {
            applyUpdate(data.version, data.manifest);
          }
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        if (closedRef.current) return;
        setStatus('reconnecting');
        const attempt = ++attemptRef.current;
        const delay = Math.min(maxReconnectMs, reconnectBaseMs * 2 ** (attempt - 1));
        timer = setTimeout(() => {
          void refresh().finally(connect);
        }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    void refresh().then(connect);

    return () => {
      closedRef.current = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [sessionId, wsBase, refresh, applyUpdate, reconnectBaseMs, maxReconnectMs]);

  return { manifest, version, status, error, interactions, sendInteraction, refresh };
}
