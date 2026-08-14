import { Router, type Request, type Response } from 'express';
import { validateTuiManifest, type TuiUserAction } from '@visual-engine/tui-shared';
import type { TuiStore } from './store/types.js';
import type { Logger } from '../logging/logger.js';
import { createLogger } from '../logging/logger.js';
import { assertSessionId, sessionIdError } from './sessionId.js';

export interface TuiRouterDeps {
  store: TuiStore;
  logger?: Logger;
}

function isUserAction(body: unknown): body is TuiUserAction {
  if (!body || typeof body !== 'object') return false;
  const b = body as Partial<TuiUserAction>;
  return (
    b.event === 'USER_ACTION' &&
    typeof b.taskId === 'string' &&
    typeof b.widgetId === 'string' &&
    typeof b.action === 'string' &&
    typeof b.payload === 'object' &&
    b.payload !== null
  );
}

export function createTuiRouter(deps: TuiRouterDeps): Router {
  const log = deps.logger ?? createLogger('info', { component: 'tui-api' });
  const router = Router();

  router.post('/manifest', async (req: Request, res: Response) => {
    const { sessionId, manifest } = req.body ?? {};
    const idempotencyKey =
      (typeof req.header('idempotency-key') === 'string' && req.header('idempotency-key')) ||
      (typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined);

    if (!assertSessionId(sessionId)) {
      res.status(400).json({ errors: [sessionIdError(sessionId)] });
      return;
    }

    const validation = validateTuiManifest(manifest);
    if (!validation.ok) {
      log.info({ errors: validation.errors, sessionId }, 'tui manifest rejected');
      res.status(400).json({ errors: validation.errors });
      return;
    }

    const result = await deps.store.saveSessionWithOutbox({
      sessionId,
      manifest: validation.data,
      idempotencyKey,
    });

    if (!result.ok) {
      res.status(400).json({ errors: [result.reason] });
      return;
    }

    log.info(
      {
        sessionId,
        taskId: result.snapshot.taskId,
        outboxEventId: result.outboxEvent.id,
        idempotentReplay: Boolean(result.idempotentReplay),
        chunks: result.snapshot.manifest.layout.chunks.length,
      },
      'tui manifest accepted',
    );

    res.status(200).json({
      ok: true,
      sessionId,
      taskId: result.snapshot.taskId,
      outboxEventId: result.outboxEvent.id,
      idempotentReplay: Boolean(result.idempotentReplay),
    });
  });

  router.get('/session/:sessionId', async (req: Request, res: Response) => {
    if (!assertSessionId(req.params.sessionId)) {
      res.status(400).json({ errors: [sessionIdError(req.params.sessionId)] });
      return;
    }
    const snap = await deps.store.getSession(req.params.sessionId);
    if (!snap) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(200).json(snap);
  });

  router.post('/action', async (req: Request, res: Response) => {
    const sessionId =
      typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined;
    const actionBody = req.body?.event === 'USER_ACTION' ? req.body : req.body?.action;

    if (!assertSessionId(sessionId)) {
      res.status(400).json({ errors: [sessionIdError(sessionId)] });
      return;
    }
    if (!isUserAction(actionBody)) {
      res.status(400).json({ errors: ['invalid USER_ACTION event'] });
      return;
    }

    await deps.store.recordAction(sessionId, actionBody);
    log.info(
      {
        sessionId,
        taskId: actionBody.taskId,
        widgetId: actionBody.widgetId,
        action: actionBody.action,
      },
      'tui USER_ACTION (http)',
    );
    res.status(202).json({ ok: true });
  });

  return router;
}
