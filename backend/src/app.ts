import express, { type Express } from 'express';
import cors from 'cors';
import type { AppConfig } from './config.js';
import { createAuthMiddleware, createRateLimitMiddleware } from './middleware/security.js';
import { createLogger, type Logger } from './logging/logger.js';
import type { TuiStore } from './tui/store/types.js';
import { createTuiRouter } from './tui/routes.js';

export interface AppDeps {
  tuiStore: TuiStore;
  config?: AppConfig;
  logger?: Logger;
  /** When false, /ready returns 503 (e.g. DB down). */
  isReady?: () => boolean | Promise<boolean>;
}

export function createApp(deps: AppDeps): Express {
  const config = deps.config;
  const log = deps.logger ?? createLogger(config?.logLevel ?? 'info');
  const app = express();

  app.use(
    cors({
      origin: config?.corsOrigin ?? true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  if (config) {
    app.use(createRateLimitMiddleware(config));
    app.use(createAuthMiddleware(config, log));
  }

  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'visual-engine-tui',
      store: config?.storeMode ?? 'memory',
    });
  });

  app.get('/ready', async (_req, res) => {
    try {
      const ok = deps.isReady ? await deps.isReady() : true;
      if (!ok) {
        res.status(503).json({ ok: false, ready: false });
        return;
      }
      res.status(200).json({
        ok: true,
        ready: true,
        store: config?.storeMode ?? 'memory',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err: message }, 'readiness check failed');
      res.status(503).json({ ok: false, ready: false, error: message });
    }
  });

  app.use('/api/v1/tui', createTuiRouter({ store: deps.tuiStore, logger: log }));

  return app;
}
