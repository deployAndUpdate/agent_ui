import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DashboardManifest, WidgetInteractionEvent } from '@visual-engine/shared';
import { VisualEngine } from '../src/VisualEngine';
import { componentRegistry } from '../src/registry';

const manifest: DashboardManifest = {
  taskId: 'req_88231',
  operation: 'SYNC_DASHBOARD',
  layout: {
    widgets: [
      {
        widgetId: 'w_01',
        type: 'MetricCard',
        size: { w: 4, h: 2 },
        props: { title: 'Active Users', value: 842 },
      },
      {
        widgetId: 'w_02',
        type: 'DataTable',
        size: { w: 8, h: 3 },
        props: {
          columns: ['id', 'name'],
          rows: [{ id: 1, name: 'alpha' }],
        },
      },
    ],
  },
};

describe('VisualEngine (component)', () => {
  it('exposes registry keys for all SDUI widget types', () => {
    expect(Object.keys(componentRegistry).sort()).toEqual(
      ['ActionLog', 'DataChart', 'DataTable', 'MetricCard'].sort(),
    );
  });

  it('renders widgets from manifest into the grid', () => {
    render(<VisualEngine manifest={manifest} onInteraction={() => undefined} />);
    expect(screen.getByText('Active Users')).toBeInTheDocument();
    expect(screen.getByText('842')).toBeInTheDocument();
    expect(screen.getByText('alpha')).toBeInTheDocument();
  });

  it('does not crash on unknown widget type', () => {
    const broken: DashboardManifest = {
      ...manifest,
      layout: {
        widgets: [
          {
            widgetId: 'x',
            type: 'MetricCard',
            size: { w: 2, h: 2 },
            props: {},
          },
          {
            widgetId: 'y',
            // cast: runtime unknown type from untrusted stream
            type: 'RawHtml' as DashboardManifest['layout']['widgets'][0]['type'],
            size: { w: 2, h: 2 },
            props: {},
          },
        ],
      },
    };
    expect(() =>
      render(<VisualEngine manifest={broken} onInteraction={() => undefined} />),
    ).not.toThrow();
    expect(screen.getByText(/unsupported widget/i)).toBeInTheDocument();
  });

  it('emits standardized widget_interaction on export action', async () => {
    const user = userEvent.setup();
    const events: WidgetInteractionEvent[] = [];
    render(
      <VisualEngine
        manifest={manifest}
        onInteraction={(e) => {
          events.push(e);
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /export csv/i }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'widget_interaction',
      taskId: 'req_88231',
      widgetId: 'w_01',
      action: 'export_csv',
      payload: { format: 'csv' },
    });
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
