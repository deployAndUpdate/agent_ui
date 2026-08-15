import type { TuiManifest } from '@visual-engine/tui-shared';
import type { AgentWebhookBody } from './types.js';
import { isBoardPrompt } from './mergeChunks.js';

export function buildEnrichPrompt(body: AgentWebhookBody): string {
  const row = body.payload.row;
  const rowIndex = body.payload.rowIndex;
  return [
    body.systemPrompt || 'more details',
    '',
    'You enrich a TUI detail screen for Visual Agent Engine.',
    'Return ONLY strict JSON TuiManifest (no markdown, no comments, no trailing commas).',
    'Hard rules:',
    '- operation: "SYNC_DASHBOARD"',
    `- taskId MUST start with "detail_" (prefer "${body.taskId}")`,
    '- layout.chunks types ONLY: Paragraph | Table | List | Gauge | Chart',
    '- chunk fields: widgetId, type, size, props',
    '- size MUST be an unsigned integer with no plus sign: 2 not +2',
    '- Prefer Paragraph/List with concrete facts about the selected row',
    '',
    `sessionId: ${body.sessionId}`,
    `widgetId: ${body.widgetId}`,
    `rowIndex: ${JSON.stringify(rowIndex ?? null)}`,
    `row: ${JSON.stringify(row ?? null)}`,
    `command: ${body.command}`,
  ].join('\n');
}

export function buildPromptFollowUp(body: AgentWebhookBody): string {
  const focused = body.payload.focusedChunk ?? null;
  const focusedId =
    typeof body.payload.focusedWidgetId === 'string'
      ? body.payload.focusedWidgetId
      : null;
  const user =
    (typeof body.payload.userPrompt === 'string' && body.payload.userPrompt) ||
    body.systemPrompt ||
    '';
  const board = isBoardPrompt(body);
  const taskRule = board
    ? `- taskId MUST be "${body.taskId}" and MUST NOT start with "detail_" (that prefix is ephemeral)`
    : `- taskId MUST start with "detail_" (prefer "${body.taskId}")`;
  const where = board
    ? 'Follow-up prompt on the existing TUI root board (session dashboard).'
    : 'Follow-up prompt on an existing TUI detail board.';
  return [
    where,
    'Return ONLY strict JSON. Prefer a TuiManifest with ONLY new or updated layout.chunks.',
    'Do NOT repeat unchanged widgets. Do not wrap in markdown.',
    'Hard rules:',
    '- operation: "SYNC_DASHBOARD"',
    taskRule,
    '- chunk types ONLY: Paragraph | Table | List | Gauge | Chart',
    '- size: unsigned integer, no plus sign (2 not +2)',
    '- New widgetId values must be unique; reuse an id to UPDATE that widget',
    '',
    `userPrompt: ${user}`,
    `focusedWidgetId: ${JSON.stringify(focusedId)}`,
    `focusedChunk: ${JSON.stringify(focused)}`,
    `row: ${JSON.stringify(body.payload.row ?? null)}`,
    `sessionId: ${body.sessionId}`,
  ].join('\n');
}

/** Deterministic enrich when no Cursor agent is available. */
export function stubEnrichManifest(body: AgentWebhookBody): TuiManifest {
  const row = Array.isArray(body.payload.row)
    ? body.payload.row.map(String)
    : [];
  const lines =
    row.length > 0
      ? row.map((cell, i) => `• col${i}: ${cell}`).join('\n')
      : '(no row payload)';
  const taskId = body.taskId.startsWith('detail_')
    ? body.taskId
    : `detail_${body.widgetId}_${String(body.payload.rowIndex ?? 0)}`;

  return {
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
            title: `${body.widgetId} · enriched`,
            text: `Row ${String(body.payload.rowIndex ?? '?')} · stub bridge`,
            style: 'magenta',
          },
        },
        {
          widgetId: 'w_detail_body',
          type: 'Paragraph',
          size: 12,
          props: {
            title: 'More details',
            text: `${body.systemPrompt || 'more details'}\n\n${lines}\n\n(Daemon driver=stub. Set CURSOR_API_KEY for SDK enrich, or TUI_BRIDGE_DRIVER=exec + TUI_BRIDGE_COMMAND.)`,
            style: 'cyan',
          },
        },
        {
          widgetId: 'w_detail_hint',
          type: 'Paragraph',
          size: 2,
          props: {
            title: 'Nav',
            text: 'Esc → board',
            style: 'white',
          },
        },
      ],
    },
  };
}

/** Keep the TUI off AwaitEnrich when a daemon job fails. */
export function errorEnrichManifest(
  body: AgentWebhookBody,
  message: string,
): TuiManifest {
  const taskId = isBoardPrompt(body)
    ? body.taskId
    : body.taskId.startsWith('detail_')
      ? body.taskId
      : `detail_${body.widgetId}_${String(body.payload.rowIndex ?? 0)}`;
  return {
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
            title: `${body.widgetId} · agent error`,
            text: String(body.command || '/details'),
            style: 'red',
          },
        },
        {
          widgetId: 'w_detail_body',
          type: 'Paragraph',
          size: 12,
          props: {
            title: 'More details',
            text: message.slice(0, 2000),
            style: 'yellow',
          },
        },
        {
          widgetId: 'w_detail_hint',
          type: 'Paragraph',
          size: 2,
          props: {
            title: 'Nav',
            text: isBoardPrompt(body) ? 'q quit' : 'Esc → board',
            style: 'white',
          },
        },
      ],
    },
  };
}
