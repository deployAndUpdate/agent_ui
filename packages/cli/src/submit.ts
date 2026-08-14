import { validateTuiManifest } from '@visual-engine/tui-shared';
import { healTuiManifest } from './healManifest.js';

export interface AgentSubmitResult {
  ok: boolean;
  attempts: number;
  status?: number;
  body?: unknown;
}

export async function submitTuiManifestWithSelfHealing(options: {
  apiBase: string;
  sessionId: string;
  manifest: unknown;
  maxAttempts?: number;
  apiKey?: string;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<AgentSubmitResult> {
  const fetchFn = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 3;
  let current = options.manifest;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.apiKey) headers['X-API-Key'] = options.apiKey;
    if (options.idempotencyKey) headers['Idempotency-Key'] = `${options.idempotencyKey}:${attempts}`;

    const res = await fetchFn(`${options.apiBase.replace(/\/$/, '')}/api/v1/tui/manifest`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId: options.sessionId,
        manifest: current,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (res.status === 200) {
      return { ok: true, attempts, status: res.status, body };
    }

    const errors: string[] = Array.isArray((body as { errors?: string[] }).errors)
      ? (body as { errors: string[] }).errors
      : [];
    current = healTuiManifest(current, errors);

    const check = validateTuiManifest(current);
    if (!check.ok && attempts >= maxAttempts) {
      return { ok: false, attempts, status: res.status, body };
    }
  }

  return { ok: false, attempts };
}
