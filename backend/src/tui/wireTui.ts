import type http from 'node:http';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logging/logger.js';
import type { TuiStore } from './store/types.js';
import { attachTuiWebSocket } from './ws/attachTuiWebSocket.js';
import { TuiOutboxPublisher } from './outbox/TuiOutboxPublisher.js';

export interface WireTuiRealtimeResult {
  publisher: TuiOutboxPublisher;
}

/** Attach TUI WebSocket + outbox publisher (HTTP routes mount via createApp). */
export function wireTuiRealtime(opts: {
  server: http.Server;
  tuiStore: TuiStore;
  config: AppConfig;
  logger: Logger;
}): WireTuiRealtimeResult {
  const hub = attachTuiWebSocket(opts.server, opts.tuiStore, opts.logger);
  const publisher = new TuiOutboxPublisher(opts.tuiStore, hub, opts.logger);
  publisher.start(opts.config.outboxIntervalMs);
  return { publisher };
}
