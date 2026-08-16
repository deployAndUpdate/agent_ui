#!/usr/bin/env node
/** stdin: webhook JSON (+ optional .prompt) → stdout: agent prompt text */
import fs from 'node:fs';

const body = JSON.parse(fs.readFileSync(0, 'utf8'));
if (typeof body.prompt === 'string' && body.prompt.trim()) {
  process.stdout.write(body.prompt);
  process.exit(0);
}
const row = Array.isArray(body.payload?.row) ? body.payload.row : [];
process.stdout.write(
  [
    body.systemPrompt || 'more details',
    '',
    'Return ONLY JSON TuiManifest. taskId MUST start with detail_.',
    'Types: Paragraph|Table|List|Gauge|Chart.',
    `taskId=${body.taskId ?? ''} row=${JSON.stringify(row)}`,
  ].join('\n'),
);
