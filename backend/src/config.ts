export interface AppConfig {
  port: number;
  databaseUrl: string | null;
  apiKeys: Set<string>;
  authEnabled: boolean;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  corsOrigin: string | boolean | string[];
  outboxIntervalMs: number;
  outboxMaxAttempts: number;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const keys = (env.API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const authEnabled = env.AUTH_ENABLED === 'true' || keys.length > 0;

  return {
    port: Number(env.PORT ?? 3001),
    databaseUrl: env.DATABASE_URL || null,
    apiKeys: new Set(keys),
    authEnabled,
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 120),
    corsOrigin: env.CORS_ORIGIN === '*' ? true : (env.CORS_ORIGIN ?? true),
    outboxIntervalMs: Number(env.OUTBOX_INTERVAL_MS ?? 50),
    outboxMaxAttempts: Number(env.OUTBOX_MAX_ATTEMPTS ?? 5),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
