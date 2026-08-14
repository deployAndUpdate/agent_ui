#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { submitTuiManifestWithSelfHealing } from './submit.js';

function usage(): never {
  console.error(`Usage:
  visual-agent submit --session <id> --file <tui-manifest.json> [--api <url>] [--api-key <key>]

Env:
  VISUAL_ENGINE_API       default http://127.0.0.1:3001
  VISUAL_ENGINE_API_KEY
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd !== 'submit') usage();

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const sessionId = get('--session');
  const file = get('--file');
  const apiBase = get('--api') ?? process.env.VISUAL_ENGINE_API ?? 'http://127.0.0.1:3001';
  const apiKey = get('--api-key') ?? process.env.VISUAL_ENGINE_API_KEY;

  if (!sessionId || !file) usage();

  const abs = path.isAbsolute(file!) ? file! : path.resolve(process.cwd(), file!);
  const manifest = JSON.parse(await fs.readFile(abs, 'utf8'));

  const result = await submitTuiManifestWithSelfHealing({
    apiBase,
    sessionId: sessionId!,
    manifest,
    apiKey,
    idempotencyKey: `cli-${sessionId}-${Date.now()}`,
    maxAttempts: 3,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
