import { describe, expect, it } from 'vitest';
import { healTuiManifest } from '../src/healManifest.js';

describe('healTuiManifest', () => {
  it('clips unknown Chart kind to line and fills datasets', () => {
    const healed = healTuiManifest({
      taskId: 't',
      operation: 'SYNC_DASHBOARD',
      layout: {
        chunks: [
          {
            widgetId: 'c',
            type: 'Chart',
            size: 4,
            props: { kind: 'radar' },
          },
        ],
      },
    }) as {
      layout: { chunks: Array<{ props: { kind: string; datasets: unknown[] } }> };
    };
    expect(healed.layout.chunks[0]?.props.kind).toBe('line');
    expect(Array.isArray(healed.layout.chunks[0]?.props.datasets)).toBe(true);
  });
});
