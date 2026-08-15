import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnrichPrompt, stubEnrichManifest } from './enrich.js';
import { postManifestCallback } from './callback.js';
import { normalizeDetailManifest } from './parseManifest.js';
import { runAgentCli } from './drivers/cli.js';
import { runAgentSdk } from './drivers/sdk.js';
import { runExecDriver } from './drivers/exec.js';
import { runForwardDriver } from './drivers/forward.js';
import type {
  AgentWebhookBody,
  BridgeConfig,
  BridgeDriver,
  ForwardMode,
} from './types.js';

const DRIVERS = new Set<BridgeDriver>(['exec', 'forward', 'cli', 'sdk', 'stub']);

function resolveDriver(raw: string, cfgHints: { exec: boolean; forward: boolean }): BridgeDriver {
  const d = raw.toLowerCase() as BridgeDriver;
  if (DRIVERS.has(d)) return d;
  // Auto-pick universal adapters when DRIVER unset/invalid
  if (cfgHints.forward) return 'forward';
  if (cfgHints.exec) return 'exec';
  return 'stub';
}

function readConfig(): BridgeConfig {
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = path.resolve(pkgRoot, '../..');
  const defaultExec = `node ${path.join(pkgRoot, 'examples/enrich-echo.mjs')}`;
  const execCommand =
    (process.env.TUI_BRIDGE_COMMAND ?? '').trim() || defaultExec;
  const forwardUrl = (process.env.TUI_BRIDGE_FORWARD_URL ?? '').trim() || null;
  const forwardModeRaw = (process.env.TUI_BRIDGE_FORWARD_MODE ?? 'sync').toLowerCase();
  const forwardMode: ForwardMode = forwardModeRaw === 'async' ? 'async' : 'sync';
  const driverRaw = (process.env.TUI_BRIDGE_DRIVER ?? 'exec').toLowerCase();

  return {
    host: process.env.TUI_BRIDGE_HOST ?? '127.0.0.1',
    port: Number(process.env.TUI_BRIDGE_PORT ?? 9090),
    path: process.env.TUI_BRIDGE_PATH ?? '/agent',
    token: (process.env.TUI_AGENT_WEBHOOK_TOKEN ?? '').trim() || null,
    driver: resolveDriver(driverRaw, {
      exec: true,
      forward: Boolean(forwardUrl),
    }),
    model: process.env.TUI_BRIDGE_MODEL ?? process.env.CURSOR_MODEL ?? 'composer-2.5',
    workspace: process.env.TUI_BRIDGE_WORKSPACE ?? repoRoot,
    agentBin: process.env.TUI_BRIDGE_AGENT_BIN ?? 'agent',
    apiKey: (process.env.CURSOR_API_KEY ?? '').trim() || null,
    apiKeyHeader: (process.env.VISUAL_ENGINE_API_KEY ?? '').trim() || null,
    execCommand,
    forwardUrl,
    forwardMode,
    timeoutMs: Number(process.env.TUI_BRIDGE_TIMEOUT_MS ?? 120_000),
  };
}

function isWebhookBody(v: unknown): v is AgentWebhookBody {
  if (!v || typeof v !== 'object') return false;
  const b = v as Partial<AgentWebhookBody>;
  return (
    typeof b.sessionId === 'string' &&
    typeof b.taskId === 'string' &&
    typeof b.widgetId === 'string' &&
    typeof b.command === 'string' &&
    typeof b.callback === 'object' &&
    b.callback !== null &&
    typeof b.callback.manifestUrl === 'string' &&
    typeof b.callback.sessionId === 'string'
  );
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function authOk(req: http.IncomingMessage, token: string | null): boolean {
  if (!token) return true;
  const h = req.headers.authorization ?? '';
  return h === `Bearer ${token}`;
}

async function enrichAndCallback(
  body: AgentWebhookBody,
  cfg: BridgeConfig,
): Promise<void> {
  const started = Date.now();
  console.info(
    `[bridge] enrich start session=${body.sessionId} task=${body.taskId} driver=${cfg.driver}`,
  );

  if (cfg.driver === 'stub') {
    const manifest = stubEnrichManifest(body);
    await callback(cfg, body, manifest);
    console.info(
      `[bridge] enrich ok session=${body.sessionId} task=${manifest.taskId} ms=${Date.now() - started}`,
    );
    return;
  }

  if (cfg.driver === 'forward') {
    const fwd = await runForwardDriver(body, cfg);
    if (fwd.asyncHandled) {
      console.info(
        `[bridge] forward async — peer owns callback session=${body.sessionId} ms=${Date.now() - started}`,
      );
      return;
    }
    const manifest = normalizeDetailManifest(fwd.text!, body.taskId);
    await callback(cfg, body, manifest);
    console.info(
      `[bridge] enrich ok session=${body.sessionId} task=${manifest.taskId} ms=${Date.now() - started}`,
    );
    return;
  }

  const prompt = buildEnrichPrompt(body);
  let text: string;
  if (cfg.driver === 'exec') {
    text = await runExecDriver(
      { ...body, systemPrompt: body.systemPrompt || prompt },
      cfg,
    );
  } else if (cfg.driver === 'sdk') {
    text = await runAgentSdk(prompt, cfg);
  } else {
    text = await runAgentCli(prompt, cfg);
  }

  const manifest = normalizeDetailManifest(text, body.taskId);
  await callback(cfg, body, manifest);
  console.info(
    `[bridge] enrich ok session=${body.sessionId} task=${manifest.taskId} ms=${Date.now() - started}`,
  );
}

async function callback(
  cfg: BridgeConfig,
  body: AgentWebhookBody,
  manifest: import('@visual-engine/tui-shared').TuiManifest,
): Promise<void> {
  const posted = await postManifestCallback({
    manifestUrl: body.callback.manifestUrl,
    sessionId: body.callback.sessionId,
    manifest,
    apiKey: cfg.apiKeyHeader,
  });
  if (!posted.ok) {
    throw new Error(
      `callback HTTP ${posted.status}: ${JSON.stringify(posted.body)}`,
    );
  }
}

function main(): void {
  const cfg = readConfig();
  const server = http.createServer((req, res) => {
    void (async () => {
      if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            driver: cfg.driver,
            port: cfg.port,
            forwardMode: cfg.forwardMode,
          }),
        );
        return;
      }

      if (req.method !== 'POST' || (req.url ?? '').split('?')[0] !== cfg.path) {
        res.writeHead(404);
        res.end('not found');
        return;
      }

      if (!authOk(req, cfg.token)) {
        res.writeHead(401);
        res.end('unauthorized');
        return;
      }

      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        res.writeHead(400);
        res.end('invalid json');
        return;
      }

      if (!isWebhookBody(body)) {
        res.writeHead(400);
        res.end('invalid webhook body');
        return;
      }

      // Ack immediately — Visual Engine waits up to 30s for this response.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, accepted: true, driver: cfg.driver }));

      try {
        await enrichAndCallback(body, cfg);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[bridge] enrich failed: ${message}`);
      }
    })();
  });

  server.listen(cfg.port, cfg.host, () => {
    console.info(
      `[bridge] listening http://${cfg.host}:${cfg.port}${cfg.path} driver=${cfg.driver}`,
    );
  });
}

main();
