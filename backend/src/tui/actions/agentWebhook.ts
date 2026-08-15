import type { TuiManifest, TuiUserAction } from '@visual-engine/tui-shared';
import type { Logger } from '../../logging/logger.js';
import { createLogger } from '../../logging/logger.js';

export interface AgentWebhookPayload {
  systemPrompt: string;
  command: string;
  sessionId: string;
  taskId: string;
  widgetId: string;
  payload: Record<string, unknown>;
  currentManifest: TuiManifest | null;
  callback: {
    manifestUrl: string;
    sessionId: string;
  };
}

export function agentWebhookConfig(env: NodeJS.ProcessEnv = process.env): {
  url: string | null;
  token: string | null;
  publicApiBase: string;
} {
  const url = (env.TUI_AGENT_WEBHOOK_URL ?? '').trim() || null;
  const token = (env.TUI_AGENT_WEBHOOK_TOKEN ?? '').trim() || null;
  const publicApiBase = (env.VISUAL_ENGINE_API ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
  return { url, token, publicApiBase };
}

/** POST agent webhook. Does not throw — logs and returns ok flag. */
export async function postAgentWebhook(opts: {
  sessionId: string;
  action: TuiUserAction;
  currentManifest: TuiManifest | null;
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  /** Injectable for tests */
  fetchImpl?: typeof fetch;
}): Promise<{ sent: boolean; reason?: string }> {
  const log = opts.logger ?? createLogger('info', { component: 'tui-webhook' });
  const { url, token, publicApiBase } = agentWebhookConfig(opts.env);
  if (!url) {
    log.warn({ sessionId: opts.sessionId }, 'TUI_AGENT_WEBHOOK_URL unset; skip webhook');
    return { sent: false, reason: 'no_url' };
  }

  const command =
    typeof opts.action.payload.command === 'string' ? opts.action.payload.command : '';
  const userPrompt =
    typeof opts.action.payload.userPrompt === 'string'
      ? opts.action.payload.userPrompt
      : typeof opts.action.payload.systemPrompt === 'string'
        ? opts.action.payload.systemPrompt
        : '';
  const systemPrompt =
    command === '/details'
      ? typeof opts.action.payload.systemPrompt === 'string'
        ? opts.action.payload.systemPrompt
        : 'more details'
      : userPrompt;

  const body: AgentWebhookPayload = {
    systemPrompt,
    command,
    sessionId: opts.sessionId,
    taskId: opts.action.taskId,
    widgetId: opts.action.widgetId,
    payload: opts.action.payload,
    currentManifest: opts.currentManifest,
    callback: {
      manifestUrl: `${publicApiBase}/api/v1/tui/manifest`,
      sessionId: opts.sessionId,
    },
  };

  const fetchFn = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn(
        { sessionId: opts.sessionId, status: res.status },
        'agent webhook non-OK response',
      );
      return { sent: false, reason: `http_${res.status}` };
    }
    log.info(
      { sessionId: opts.sessionId, command, systemPrompt },
      'agent webhook posted',
    );
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ sessionId: opts.sessionId, err: message }, 'agent webhook failed');
    return { sent: false, reason: message };
  } finally {
    clearTimeout(timer);
  }
}
