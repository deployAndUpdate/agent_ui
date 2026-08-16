import http from 'node:http';
import { readConfig } from './config.js';
import { DaemonRuntime } from './handlers.js';
import type { AgentWebhookBody } from './types.js';

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

function main(): void {
  const cfg = readConfig();
  const runtime = new DaemonRuntime(cfg);

  const server = http.createServer((req, res) => {
    void (async () => {
      if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            role: 'daemon',
            driver: cfg.driver,
            llm: runtime.llm,
            busySessions: runtime.busyCount,
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
      res.end(
        JSON.stringify({
          ok: true,
          accepted: true,
          queued: runtime.queue.isBusy(body.sessionId),
          driver: cfg.driver,
        }),
      );

      try {
        await runtime.handleQueued(body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[bridge] queued job failed: ${message}`);
      }
    })();
  });

  const shutdown = (): void => {
    server.close(() => {
      void runtime.shutdown().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(cfg.port, cfg.host, () => {
    console.info(
      `[bridge] daemon http://${cfg.host}:${cfg.port}${cfg.path} driver=${cfg.driver} llm=${runtime.llm}`,
    );
    void runtime.start();
  });
}

main();
