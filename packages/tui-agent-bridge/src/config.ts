import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampJsonRetries, DEFAULT_JSON_RETRIES } from './retryJson.js';
import type { BridgeConfig, BridgeDriver, ForwardMode } from './types.js';

const DRIVERS = new Set<BridgeDriver>(['exec', 'forward', 'cli', 'sdk', 'stub']);

/**
 * `auto` (default): Cursor SDK when CURSOR_API_KEY is set, else forward, else
 * explicit exec command, else in-process stub. Never forks Cursor CLI unless
 * driver=cli or an enrich-cursor wrapper is set as TUI_BRIDGE_COMMAND.
 */
export function resolveDriver(
  raw: string | undefined,
  hints: { apiKey: boolean; execCommandSet: boolean; forward: boolean },
): BridgeDriver {
  const d = (raw ?? 'auto').trim().toLowerCase();
  if (d === 'auto' || d === '') {
    if (hints.apiKey) return 'sdk';
    if (hints.forward) return 'forward';
    if (hints.execCommandSet) return 'exec';
    return 'stub';
  }
  if (DRIVERS.has(d as BridgeDriver)) return d as BridgeDriver;
  if (hints.apiKey) return 'sdk';
  if (hints.forward) return 'forward';
  if (hints.execCommandSet) return 'exec';
  return 'stub';
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const repoRoot = path.resolve(pkgRoot, '../..');
  const defaultExec = `node ${path.join(pkgRoot, 'examples/enrich-echo.mjs')}`;
  const commandRaw = (env.TUI_BRIDGE_COMMAND ?? '').trim();
  const execCommand = commandRaw || defaultExec;
  const forwardUrl = (env.TUI_BRIDGE_FORWARD_URL ?? '').trim() || null;
  const forwardModeRaw = (env.TUI_BRIDGE_FORWARD_MODE ?? 'sync').toLowerCase();
  const forwardMode: ForwardMode = forwardModeRaw === 'async' ? 'async' : 'sync';
  const apiKey = (env.CURSOR_API_KEY ?? '').trim() || null;
  const driverRaw = env.TUI_BRIDGE_DRIVER ?? 'auto';

  return {
    host: env.TUI_BRIDGE_HOST ?? '127.0.0.1',
    port: Number(env.TUI_BRIDGE_PORT ?? 9090),
    path: env.TUI_BRIDGE_PATH ?? '/agent',
    token: (env.TUI_AGENT_WEBHOOK_TOKEN ?? '').trim() || null,
    driver: resolveDriver(driverRaw, {
      apiKey: Boolean(apiKey),
      execCommandSet: Boolean(commandRaw),
      forward: Boolean(forwardUrl),
    }),
    model: env.TUI_BRIDGE_MODEL ?? env.CURSOR_MODEL ?? 'composer-2.5',
    workspace: env.TUI_BRIDGE_WORKSPACE ?? repoRoot,
    agentBin: env.TUI_BRIDGE_AGENT_BIN ?? 'agent',
    apiKey,
    apiKeyHeader: (env.VISUAL_ENGINE_API_KEY ?? '').trim() || null,
    execCommand,
    forwardUrl,
    forwardMode,
    timeoutMs: Number(env.TUI_BRIDGE_TIMEOUT_MS ?? 120_000),
    jsonRetries: clampJsonRetries(
      Number(env.TUI_BRIDGE_JSON_RETRIES ?? DEFAULT_JSON_RETRIES),
    ),
  };
}
