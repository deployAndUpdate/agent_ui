export interface AgentWebhookBody {
  systemPrompt: string;
  command: string;
  sessionId: string;
  taskId: string;
  widgetId: string;
  payload: Record<string, unknown>;
  currentManifest: unknown;
  callback: {
    manifestUrl: string;
    sessionId: string;
  };
}

/**
 * Universal drivers (any agent):
 * - exec    — run a command; stdin = webhook JSON, stdout = TuiManifest JSON
 * - forward — POST webhook JSON to another HTTP URL (Claude/OpenCode/n8n/…)
 *
 * Convenience (Cursor-specific):
 * - cli | sdk
 *
 * Dev:
 * - stub
 */
export type BridgeDriver = 'exec' | 'forward' | 'cli' | 'sdk' | 'stub';

export type ForwardMode = 'sync' | 'async';

export interface BridgeConfig {
  host: string;
  port: number;
  path: string;
  token: string | null;
  driver: BridgeDriver;
  model: string;
  workspace: string;
  agentBin: string;
  apiKey: string | null;
  apiKeyHeader: string | null;
  /** Full shell command for driver=exec (defaults to enrich-echo.mjs) */
  execCommand: string;
  /** Upstream URL for driver=forward */
  forwardUrl: string | null;
  /** sync: response body = manifest; async: peer calls callback itself */
  forwardMode: ForwardMode;
  timeoutMs: number;
}
