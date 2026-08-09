/**
 * Deterministic mock-AI healer: maps common AJV failures into a valid manifest.
 */
import type { DashboardManifest, ManifestOperation, WidgetType } from '@visual-engine/shared';

const OPERATIONS: ManifestOperation[] = [
  'SYNC_DASHBOARD',
  'ADD_WIDGET',
  'UPDATE_WIDGET',
  'REMOVE_WIDGET',
];

const WIDGET_TYPES: WidgetType[] = ['MetricCard', 'DataChart', 'ActionLog', 'DataTable'];

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function defaultProps(type: WidgetType, existing: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'MetricCard':
      return {
        title: typeof existing.title === 'string' ? existing.title : 'Metric',
        value: existing.value ?? 0,
        ...(typeof existing.unit === 'string' ? { unit: existing.unit } : {}),
      };
    case 'DataChart':
      return {
        title: typeof existing.title === 'string' ? existing.title : 'Chart',
        series: Array.isArray(existing.series) ? existing.series : [],
      };
    case 'ActionLog':
      return {
        entries: Array.isArray(existing.entries) ? existing.entries : [],
      };
    case 'DataTable':
      return {
        columns: Array.isArray(existing.columns) ? existing.columns.map(String) : ['id'],
        rows: Array.isArray(existing.rows) ? existing.rows : [],
      };
  }
}

export function healManifest(payload: unknown, _errors: string[]): DashboardManifest {
  const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const layout = (raw.layout && typeof raw.layout === 'object' ? raw.layout : {}) as Record<
    string,
    unknown
  >;
  const widgetsRaw = Array.isArray(layout.widgets) ? layout.widgets : [];

  const widgets = widgetsRaw.map((item, index) => {
    const w = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const size = (w.size && typeof w.size === 'object' ? w.size : {}) as Record<string, unknown>;
    const type = WIDGET_TYPES.includes(w.type as WidgetType)
      ? (w.type as WidgetType)
      : 'MetricCard';
    const propsRaw =
      w.props && typeof w.props === 'object' ? (w.props as Record<string, unknown>) : {};

    return {
      widgetId: typeof w.widgetId === 'string' && w.widgetId.length > 0 ? w.widgetId : `w_${index}`,
      type,
      size: {
        w: clamp(Number(size.w), 1, 12),
        h: clamp(Number(size.h), 1, 6),
      },
      props: defaultProps(type, propsRaw),
    };
  });

  const operation = OPERATIONS.includes(raw.operation as ManifestOperation)
    ? (raw.operation as ManifestOperation)
    : 'SYNC_DASHBOARD';

  return {
    taskId: typeof raw.taskId === 'string' && raw.taskId.length > 0 ? raw.taskId : 'healed_task',
    operation,
    layout: { widgets },
  };
}
