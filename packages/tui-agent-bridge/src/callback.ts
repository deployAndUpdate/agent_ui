import type { TuiManifest } from '@visual-engine/tui-shared';

export async function postManifestCallback(opts: {
  manifestUrl: string;
  sessionId: string;
  manifest: TuiManifest;
  apiKey?: string | null;
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'idempotency-key': `bridge-${opts.sessionId}-${opts.manifest.taskId}-${Date.now()}`,
  };
  if (opts.apiKey) {
    headers['x-api-key'] = opts.apiKey;
  }

  const res = await fetch(opts.manifestUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: opts.sessionId,
      manifest: opts.manifest,
    }),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { ok: res.ok, status: res.status, body };
}
