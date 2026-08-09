import request from 'supertest';
import type { Express } from 'express';
import { validateManifest } from '@visual-engine/shared';
import { healManifest } from './healManifest.js';

export interface SelfHealingResult {
  ok: boolean;
  attempts: number;
  status?: number;
  body?: unknown;
}

export async function runSelfHealingAgent(options: {
  app: Express;
  sessionId: string;
  initialManifest: unknown;
  version: number;
  maxAttempts?: number;
}): Promise<SelfHealingResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  let current = options.initialManifest;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    const res = await request(options.app)
      .post('/api/manifest')
      .send({
        sessionId: options.sessionId,
        version: options.version,
        manifest: current,
      });

    if (res.status === 200) {
      return { ok: true, attempts, status: res.status, body: res.body };
    }

    const errors: string[] = Array.isArray(res.body?.errors) ? res.body.errors : [];
    current = healManifest(current, errors);

    // ensure heal produced something schema-valid before next attempt when possible
    const check = validateManifest(current);
    if (!check.ok && attempts >= maxAttempts) {
      return { ok: false, attempts, status: res.status, body: res.body };
    }
  }

  return { ok: false, attempts };
}
