import type { TuiManifest } from '@visual-engine/tui-shared';
import { validateTuiManifest } from '@visual-engine/tui-shared';

/**
 * LLM JSON often has unary plus (`"size": +2`) and trailing commas.
 * Strip those outside of strings so JSON.parse can succeed.
 */
export function repairLlmJson(text: string): string {
  let out = '';
  let inStr = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      out += c;
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
      out += c;
      continue;
    }
    if (c === '+' && /[0-9]/.test(text[i + 1] ?? '')) {
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /[ \t\r\n]/.test(text[j]!)) j += 1;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += c;
  }
  return out;
}

function parseJsonSlice(slice: string): unknown {
  try {
    return JSON.parse(slice);
  } catch {
    return JSON.parse(repairLlmJson(slice));
  }
}

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
        return parseJsonSlice(text.slice(start, i + 1));
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
    return parseJsonSlice(candidate);
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
