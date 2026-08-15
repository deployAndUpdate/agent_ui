#!/usr/bin/env node
/**
 * Minimal universal enricher for driver=exec.
 * Reads AgentWebhookBody JSON from stdin, writes TuiManifest JSON to stdout.
 * Swap this script for claude/opencode/cursor wrappers — same I/O contract.
 */
import fs from 'node:fs';

const raw = fs.readFileSync(0, 'utf8');
const body = JSON.parse(raw);
const row = Array.isArray(body.payload?.row) ? body.payload.row.map(String) : [];
const taskId = String(body.taskId || 'detail_unknown').startsWith('detail_')
  ? String(body.taskId)
  : `detail_${body.widgetId || 'w'}_${body.payload?.rowIndex ?? 0}`;

const manifest = {
  taskId,
  operation: 'SYNC_DASHBOARD',
  layout: {
    direction: 'vertical',
    chunks: [
      {
        widgetId: 'w_detail_title',
        type: 'Paragraph',
        size: 3,
        props: {
          title: `${body.widgetId || 'row'} · exec enrich`,
          text: `Row ${body.payload?.rowIndex ?? '?'}`,
          style: 'magenta',
        },
      },
      {
        widgetId: 'w_detail_body',
        type: 'Paragraph',
        size: 12,
        props: {
          title: 'More details',
          text:
            `${body.systemPrompt || 'more details'}\n\n` +
            (row.length ? row.map((c, i) => `• [${i}] ${c}`).join('\n') : '(empty)'),
          style: 'cyan',
        },
      },
      {
        widgetId: 'w_detail_hint',
        type: 'Paragraph',
        size: 2,
        props: { title: 'Nav', text: 'Esc → board', style: 'white' },
      },
    ],
  },
};

process.stdout.write(JSON.stringify(manifest));
