import http from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createStore } from './store/createStore.js';
import { attachWebSocketServer } from './ws/attachWebSocketServer.js';
import { OutboxPublisher } from './outbox/OutboxPublisher.js';
import { createLogger } from './logging/logger.js';
import { createTuiStore } from './tui/store/createTuiStore.js';
import { wireTuiRealtime } from './tui/wireTui.js';

const config = loadConfig();
const log = createLogger(config.logLevel, { service: 'visual-engine-backend' });

const { store, pool } = await createStore(config.databaseUrl);
const tuiStore = await createTuiStore(config.databaseUrl, pool);
const app = createApp({ store, tuiStore, config, logger: log });
const server = http.createServer(app);
const hub = attachWebSocketServer(server, store);
const publisher = new OutboxPublisher(store, hub, config.outboxMaxAttempts, log);
publisher.start(config.outboxIntervalMs);
wireTuiRealtime({ server, tuiStore, config, logger: log });

server.listen(config.port, () => {
  log.info(
    {
      port: config.port,
      store: config.databaseUrl ? 'postgres' : 'memory',
      authEnabled: config.authEnabled,
      tuiWs: '/api/v1/tui/stream',
    },
    'Visual Agent Engine backend listening',
  );
});
