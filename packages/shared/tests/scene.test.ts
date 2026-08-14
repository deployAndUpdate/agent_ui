import { describe, expect, it } from 'vitest';
import { manifestToScene } from '../src/scene.js';
import { validManifest } from './fixtures.js';

describe('manifestToScene', () => {
  it('builds a schemaVersion 1 scene with 12-col grid', () => {
    const scene = manifestToScene(validManifest);
    expect(scene.schemaVersion).toBe(1);
    expect(scene.taskId).toBe('req_88231');
    expect(scene.grid.columns).toBe(12);
    expect(scene.nodes).toHaveLength(4);
  });

  it('maps size to colSpan / rowSpan / minHeightUnits', () => {
    const scene = manifestToScene(validManifest);
    const metric = scene.nodes.find((n) => n.widgetId === 'w_01');
    expect(metric).toMatchObject({
      type: 'MetricCard',
      colSpan: 3,
      rowSpan: 2,
      minHeightUnits: 8,
      traits: { hero: false },
    });
  });

  it('marks MetricCard with imageUrl as hero', () => {
    const scene = manifestToScene({
      ...validManifest,
      layout: {
        widgets: [
          {
            widgetId: 'hero',
            type: 'MetricCard',
            size: { w: 12, h: 3 },
            props: { title: 'Brand', value: 1, imageUrl: 'https://example.com/x.png' },
          },
        ],
      },
    });
    expect(scene.nodes[0]?.traits.hero).toBe(true);
  });

  it('clamps invalid spans', () => {
    const scene = manifestToScene({
      taskId: 't',
      operation: 'SYNC_DASHBOARD',
      layout: {
        widgets: [
          {
            widgetId: 'w',
            type: 'MetricCard',
            size: { w: 99, h: 0 },
            props: { title: 'x', value: 0 },
          },
        ],
      },
    });
    expect(scene.nodes[0]?.colSpan).toBe(12);
    expect(scene.nodes[0]?.rowSpan).toBe(1);
  });
});
