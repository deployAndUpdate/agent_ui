/**
 * Feed parse/AJV errors back to the same LLM until the reply is a valid
 * TuiManifest. Cap attempts — do not loop forever (token cost + loader wait).
 */

export const DEFAULT_JSON_RETRIES = 3;

export function clampJsonRetries(n: number): number {
  if (!Number.isFinite(n) || n < 1) return DEFAULT_JSON_RETRIES;
  return Math.min(5, Math.floor(n));
}

export function buildJsonRepairPrompt(previousOutput: string, error: string): string {
  return [
    'Your previous reply was not a valid TuiManifest JSON.',
    'Fix it. Return ONLY strict JSON (no markdown, no comments, no trailing commas).',
    `Error: ${error}`,
    '',
    'Hard rules:',
    '- operation: "SYNC_DASHBOARD"',
    '- layout.chunks types ONLY: Paragraph | Table | List | Gauge | Chart',
    '- chunk fields: widgetId, type, size, props',
    '- size MUST be an unsigned integer with no plus sign: 2 not +2',
    '',
    'Previous output (truncated):',
    previousOutput.slice(0, 4000),
  ].join('\n');
}

export async function parseLlmWithRetry<T>(opts: {
  send: (prompt: string) => Promise<string>;
  initialPrompt: string;
  parse: (text: string) => T;
  maxAttempts?: number;
  onRetry?: (attempt: number, error: string) => void;
}): Promise<T> {
  const max = clampJsonRetries(opts.maxAttempts ?? DEFAULT_JSON_RETRIES);
  let prompt = opts.initialPrompt;
  let lastErr = 'no attempt';
  for (let attempt = 1; attempt <= max; attempt++) {
    const text = await opts.send(prompt);
    try {
      return opts.parse(text);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      opts.onRetry?.(attempt, lastErr);
      if (attempt >= max) break;
      prompt = buildJsonRepairPrompt(text, lastErr);
    }
  }
  throw new Error(`invalid TuiManifest after ${max} attempts: ${lastErr}`);
}
