import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentWebhookBody, BridgeConfig } from '../types.js';
import { buildEnrichPrompt } from '../enrich.js';

/** Split a command line without spawning a shell (so JSON stdin is not executed as bash). */
export function parseArgv(cmd: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  const s = cmd.trim();
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === quote) {
        quote = null;
        continue;
      }
      if (c === '\\' && quote === '"' && i + 1 < s.length) {
        cur += s[i + 1]!;
        i += 1;
        continue;
      }
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Universal adapter: any agent wrapper that speaks stdin/stdout JSON.
 *
 * stdin / TUI_ENRICH_BODY_FILE → AgentWebhookBody + { prompt }
 * stdout → TuiManifest JSON
 */
export async function runExecDriver(
  body: AgentWebhookBody,
  cfg: BridgeConfig,
): Promise<string> {
  const argv = parseArgv(cfg.execCommand);
  if (argv.length === 0) {
    throw new Error(
      'TUI_BRIDGE_COMMAND required for driver=exec (e.g. "node examples/enrich-echo.mjs")',
    );
  }
  const bin = argv[0]!;
  if (
    argv.length === 1 &&
    /^(bash|sh|zsh|dash)$/.test(path.basename(bin))
  ) {
    throw new Error(
      'TUI_BRIDGE_COMMAND is only "bash" — quote the full command: TUI_BRIDGE_COMMAND="bash packages/tui-agent-bridge/examples/enrich-cursor.sh"',
    );
  }

  const payload = JSON.stringify({
    ...body,
    prompt: buildEnrichPrompt(body),
  });

  const dir = mkdtempSync(path.join(tmpdir(), 'tui-enrich-'));
  const bodyFile = path.join(dir, 'body.json');
  writeFileSync(bodyFile, payload);

  return await new Promise((resolve, reject) => {
    const child = spawn(bin, argv.slice(1), {
      cwd: cfg.workspace,
      env: {
        ...process.env,
        TUI_ENRICH_SESSION_ID: body.sessionId,
        TUI_ENRICH_TASK_ID: body.taskId,
        TUI_ENRICH_CALLBACK_URL: body.callback.manifestUrl,
        TUI_ENRICH_SYSTEM_PROMPT: body.systemPrompt ?? '',
        TUI_ENRICH_BODY_FILE: bodyFile,
      },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.info(`[bridge] exec ${argv.map((a) => JSON.stringify(a)).join(' ')}`);

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`exec timed out after ${cfg.timeoutMs}ms`));
    }, cfg.timeoutMs);

    const cleanup = (): void => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    };

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      cleanup();
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      cleanup();
      if (code !== 0) {
        reject(
          new Error(
            `exec exited ${code}: ${stderr.trim() || stdout.trim() || 'no output'}`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });

    child.stdin?.write(payload);
    child.stdin?.end();
  });
}
