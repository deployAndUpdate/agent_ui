import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { validateManifest, type WidgetInteractionEvent } from '@visual-engine/shared';
import type { DashboardStore } from './store/types.js';
import type { AppConfig } from './config.js';
import { createAuthMiddleware, createRateLimitMiddleware } from './middleware/security.js';
import { createLogger, type Logger } from './logging/logger.js';

export interface AppDeps {
  store: DashboardStore;
  config?: AppConfig;
  logger?: Logger;
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
    res.status(200).json({ ok: true });
  });

  app.post('/api/manifest', async (req: Request, res: Response) => {
    const { sessionId, version, manifest } = req.body ?? {};
    const idempotencyKey =
      (typeof req.header('idempotency-key') === 'string' && req.header('idempotency-key')) ||
      (typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined);

    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      res.status(400).json({ errors: ['sessionId is required'] });
      return;
    }
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      res.status(400).json({ errors: ['version must be a positive integer'] });
      return;
    }

    const validation = validateManifest(manifest);
    if (!validation.ok) {
      log.info({ errors: validation.errors, sessionId }, 'manifest rejected');
      res.status(400).json({ errors: validation.errors });
      return;
    }

    const result = await deps.store.saveDashboardWithOutbox({
      sessionId,
      version,
      manifest: validation.data,
      idempotencyKey,
    });

    if (!result.ok) {
      res.status(409).json({ errors: [`optimistic lock: ${result.reason}`] });
      return;
    }

    log.info(
      {
        sessionId,
        version: result.snapshot.version,
        outboxEventId: result.outboxEvent.id,
        idempotentReplay: Boolean(result.idempotentReplay),
      },
      'manifest accepted',
    );

    res.status(200).json({
      ok: true,
      sessionId,
      version: result.snapshot.version,
      outboxEventId: result.outboxEvent.id,
      idempotentReplay: Boolean(result.idempotentReplay),
    });
  });

  app.get('/api/dashboard/:sessionId', async (req: Request, res: Response) => {
    const dash = await deps.store.getDashboard(req.params.sessionId);
    if (!dash) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(200).json(dash);
  });

  app.post('/api/widget-interaction', async (req: Request, res: Response) => {
    const body = req.body as Partial<WidgetInteractionEvent>;
    if (
      body?.type !== 'widget_interaction' ||
      typeof body.taskId !== 'string' ||
      typeof body.widgetId !== 'string' ||
      typeof body.action !== 'string' ||
      typeof body.timestamp !== 'string' ||
      typeof body.payload !== 'object' ||
      body.payload === null
    ) {
      res.status(400).json({ errors: ['invalid widget_interaction event'] });
      return;
    }
    await deps.store.recordInteraction(body as WidgetInteractionEvent);
    res.status(202).json({ ok: true });
  });

  return app;
}
