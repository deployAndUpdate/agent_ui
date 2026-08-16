import type { AgentWebhookBody, BridgeConfig } from '../types.js';

export interface ForwardResult {
  /** Present when forwardMode=sync and peer returned a manifest body */
  text?: string;
  /** Peer will POST callback itself */
  asyncHandled: boolean;
}

/**
 * Universal HTTP hop: forward the same webhook JSON to Claude Code hook,
 * OpenCode plugin, n8n, custom server, etc.
 *
 * - sync  → response body must be TuiManifest (or {manifest}); bridge callbacks
 * - async → peer returns 2xx quickly and posts to callback.manifestUrl itself
 */
export async function runForwardDriver(
  body: AgentWebhookBody,
  cfg: BridgeConfig,
): Promise<ForwardResult> {
  if (!cfg.forwardUrl?.trim()) {
    throw new Error('TUI_BRIDGE_FORWARD_URL required for driver=forward');
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (cfg.token) {
    headers.authorization = `Bearer ${cfg.token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.forwardUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`forward HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    if (cfg.forwardMode === 'async') {
      return { asyncHandled: true };
    }
    if (!text.trim()) {
      throw new Error('forward sync mode: empty response body (expected TuiManifest JSON)');
    }
    return { text, asyncHandled: false };
  } finally {
    clearTimeout(timer);
  }
}
