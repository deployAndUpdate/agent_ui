import type { TuiManifest, TuiManifestOperation, TuiWidgetType } from '@visual-engine/tui-shared';

const OPS: TuiManifestOperation[] = [
  'SYNC_DASHBOARD',
  'ADD_WIDGET',
  'UPDATE_WIDGET',
  'REMOVE_WIDGET',
];
const TYPES: TuiWidgetType[] = ['Paragraph', 'Table', 'List', 'Gauge', 'Chart'];

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Best-effort repair of common TUI schema mistakes for Self-Healing. */
export function healTuiManifest(payload: unknown, _errors: string[] = []): unknown {
  const root = asRecord(payload);
  const layout = asRecord(root.layout);

  let chunks = layout.chunks;
  if (!Array.isArray(chunks) && Array.isArray(layout.widgets)) {
    chunks = layout.widgets;
  }
  if (!Array.isArray(chunks)) chunks = [];

  const fixedChunks = (chunks as unknown[]).map((raw, i) => {
    const c = asRecord(raw);
    let size = c.size;
    if (size && typeof size === 'object') {
      const s = asRecord(size);
      const w = Number(s.w) || 1;
      const h = Number(s.h) || 1;
      size = Math.max(1, w + h);
    }
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) {
      size = 3;
    }
    let type = String(c.type ?? 'Paragraph');
    if (!TYPES.includes(type as TuiWidgetType)) {
      type = 'Paragraph';
    }
    let props = asRecord(c.props);
    if (type === 'Paragraph' && typeof props.text !== 'string') {
      props = { ...props, text: String(props.text ?? props.title ?? props.value ?? '') };
    }
    if (type === 'Table') {
      if (!Array.isArray(props.headers)) props = { ...props, headers: ['col'] };
      if (!Array.isArray(props.rows)) props = { ...props, rows: [] };
    }
    if (type === 'List' && !Array.isArray(props.items)) {
      props = { ...props, items: [] };
    }
    if (type === 'Gauge' && typeof props.ratio !== 'number') {
      props = { ...props, ratio: 0 };
    }
    if (type === 'Chart') {
      if (!Array.isArray(props.datasets)) {
        props = { ...props, datasets: [{ name: 'series', data: [0] }] };
      }
      const kinds = ['line', 'bar', 'sparkline', 'pie', 'stacked'];
      if (props.kind != null && !kinds.includes(String(props.kind))) {
        props = { ...props, kind: 'line' };
      }
    }
    return {
      widgetId: String(c.widgetId ?? `w_${i + 1}`),
      type,
      size,
      props,
    };
  });

  let operation = String(root.operation ?? 'SYNC_DASHBOARD');
  if (!OPS.includes(operation as TuiManifestOperation)) {
    operation = 'SYNC_DASHBOARD';
  }

  const healed: TuiManifest = {
    taskId: String(root.taskId ?? `task_${Date.now()}`),
    operation: operation as TuiManifestOperation,
    layout: {
      direction:
        layout.direction === 'horizontal' || layout.direction === 'vertical'
          ? layout.direction
          : 'vertical',
      chunks: fixedChunks as TuiManifest['layout']['chunks'],
    },
  };
  return healed;
}
