import http from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logging/logger.js';
import { createTuiStore } from './tui/store/createTuiStore.js';
import { runMigrations } from './tui/store/migrate.js';
import { wireTuiRealtime } from './tui/wireTui.js';
import pg from 'pg';

const { Pool } = pg;

const config = loadConfig();
const log = createLogger(config.logLevel, {
  service: 'visual-engine-backend',
  env: config.nodeEnv,
});

let pool: pg.Pool | undefined;
let ready = true;

if (config.databaseUrl) {
  await runMigrations(config.databaseUrl);
  pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    ready = false;
    throw err;
  }
}

const tuiStore = await createTuiStore(config.databaseUrl, pool);
const app = createApp({
  tuiStore,
  config,
  logger: log,
  isReady: async () => {
    if (!ready) return false;
    if (!pool) return true;
    await pool.query('SELECT 1');
    return true;
  },
});
const server = http.createServer(app);
const { publisher } = wireTuiRealtime({ server, tuiStore, config, logger: log });

server.listen(config.port, () => {
  log.info(
    {
      port: config.port,
      store: config.storeMode,
      authEnabled: config.authEnabled,
      tuiWs: '/api/v1/tui/stream',
    },
    'Visual Agent Engine (TUI) listening',
  );
});

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'shutting down');
  publisher.stop();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  if (pool) {
    await pool.end();
  }
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
