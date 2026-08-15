import { describe, expect, it } from 'vitest';
import type { TuiManifest } from '@visual-engine/tui-shared';
import type { AgentWebhookBody } from '../src/types.js';
import {
  currentDetailFromBody,
  mergeDetailChunks,
  stubPromptPatch,
} from '../src/mergeChunks.js';

const base: TuiManifest = {
  taskId: 'detail_w_table_0',
  operation: 'SYNC_DASHBOARD',
  layout: {
    direction: 'vertical',
    chunks: [
      {
        widgetId: 'w_detail_title',
        type: 'Paragraph',
        size: 3,
        props: { text: 'old title' },
      },
      {
        widgetId: 'w_detail_body',
        type: 'Paragraph',
        size: 8,
        props: { text: 'old body' },
      },
    ],
  },
};

const body: AgentWebhookBody = {
  systemPrompt: 'add a list',
  command: '/prompt',
  sessionId: 'demo',
  taskId: 'detail_w_table_0',
  widgetId: 'w_detail_body',
  payload: {
    userPrompt: 'add a list',
    focusedWidgetId: 'w_detail_body',
    currentDetail: base,
  },
  currentManifest: null,
  callback: {
    manifestUrl: 'http://127.0.0.1:3001/api/v1/tui/manifest',
    sessionId: 'demo',
  },
};

describe('mergeDetailChunks', () => {
  it('updates matching widgetId and appends new ones', () => {
    const patch: TuiManifest = {
      taskId: 'detail_w_table_0',
      operation: 'SYNC_DASHBOARD',
      layout: {
        direction: 'vertical',
        chunks: [
          {
            widgetId: 'w_detail_body',
            type: 'Paragraph',
            size: 10,
            props: { text: 'updated' },
          },
          {
            widgetId: 'w_extra',
            type: 'List',
            size: 6,
            props: { items: ['a', 'b'] },
          },
        ],
      },
    };
    const merged = mergeDetailChunks(base, patch);
    expect(merged.layout.chunks.map((c) => c.widgetId)).toEqual([
      'w_detail_title',
      'w_detail_body',
      'w_extra',
    ]);
    expect(merged.layout.chunks[1]?.props).toMatchObject({ text: 'updated' });
  });

  it('reads currentDetail from webhook payload', () => {
    expect(currentDetailFromBody(body)?.taskId).toBe('detail_w_table_0');
  });

  it('stub prompt patch merges onto current detail', () => {
    const merged = mergeDetailChunks(base, stubPromptPatch(body));
    expect(merged.layout.chunks.length).toBe(3);
    expect(merged.layout.chunks[2]?.widgetId).toContain('w_prompt_');
  });
});
