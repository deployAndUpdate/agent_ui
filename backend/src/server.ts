import http from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createStore } from './store/createStore.js';
import { attachWebSocketServer } from './ws/attachWebSocketServer.js';
import { OutboxPublisher } from './outbox/OutboxPublisher.js';
import { createLogger } from './logging/logger.js';

const config = loadConfig();
const log = createLogger(config.logLevel, { service: 'visual-engine-backend' });

const { store } = await createStore(config.databaseUrl);
const app = createApp({ store, config, logger: log });
const server = http.createServer(app);
const hub = attachWebSocketServer(server, store);
const publisher = new OutboxPublisher(store, hub, config.outboxMaxAttempts, log);
publisher.start(config.outboxIntervalMs);

server.listen(config.port, () => {
  log.info(
    {
      port: config.port,
      store: config.databaseUrl ? 'postgres' : 'memory',
      authEnabled: config.authEnabled,
    },
    'Visual Agent Engine backend listening',
  );
});
