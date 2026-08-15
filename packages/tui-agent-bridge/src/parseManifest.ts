import type { TuiManifest } from '@visual-engine/tui-shared';
import { validateTuiManifest } from '@visual-engine/tui-shared';

/** First `{...}` object (string-aware). Ignores trailing junk from agent CLIs. */
function firstJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) {
    throw new Error('no JSON object in agent output');
  }
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }
  throw new Error('no JSON object in agent output');
}

/** Extract first JSON object from agent text (tolerates markdown fences + trailing text). */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    return firstJsonObject(candidate);
  }
}

export function normalizeDetailManifest(
  raw: unknown,
  fallbackTaskId: string,
): TuiManifest {
  const parsed = extractJsonObject(
    typeof raw === 'string' ? raw : JSON.stringify(raw),
  );
  // Allow { manifest: {...} } wrappers
  const maybeWrapped =
    parsed &&
    typeof parsed === 'object' &&
    'manifest' in (parsed as object) &&
    (parsed as { manifest: unknown }).manifest
      ? (parsed as { manifest: unknown }).manifest
      : parsed;

  const validation = validateTuiManifest(maybeWrapped);
  if (!validation.ok) {
    throw new Error(`invalid TuiManifest: ${validation.errors.join('; ')}`);
  }
  const manifest = validation.data;
  if (!manifest.taskId.startsWith('detail_')) {
    manifest.taskId = fallbackTaskId.startsWith('detail_')
      ? fallbackTaskId
      : `detail_${fallbackTaskId}`;
  }
  return manifest;
}
