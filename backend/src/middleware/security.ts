import type { Request, Response, NextFunction } from 'express';
import type { AppConfig } from '../config.js';
import type { Logger } from '../logging/logger.js';

export function createAuthMiddleware(config: AppConfig, log: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.authEnabled) {
      next();
      return;
    }
    // liveness / readiness are open
    if (req.path === '/health' || req.path === '/ready') {
      next();
      return;
    }
    const key = req.header('x-api-key') ?? '';
    if (!config.apiKeys.has(key)) {
      log.warn({ path: req.path }, 'unauthorized');
      res.status(401).json({ errors: ['unauthorized'] });
      return;
    }
    next();
  };
}

export function createRateLimitMiddleware(config: AppConfig) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.header('x-api-key') || req.ip || 'anon';
    const now = Date.now();
    let bucket = hits.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + config.rateLimitWindowMs };
      hits.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > config.rateLimitMax) {
      res.status(429).json({ errors: ['rate_limit_exceeded'] });
      return;
    }
    next();
  };
}
