import type { DashboardManifest, WidgetManifest } from './types.js';

/**
 * Applies SDUI operation semantics against the current persisted layout.
 * Incoming `manifest.layout.widgets` is treated as a full replace for SYNC,
 * or as a delta for ADD / UPDATE / REMOVE.
 */
export function applyLayoutOperation(
  current: DashboardManifest | null,
  incoming: DashboardManifest,
): DashboardManifest {
  const baseWidgets: WidgetManifest[] = current?.layout.widgets ?? [];

  switch (incoming.operation) {
    case 'SYNC_DASHBOARD':
      return {
        ...incoming,
        layout: { widgets: [...incoming.layout.widgets] },
      };
    case 'ADD_WIDGET': {
      const byId = new Map(baseWidgets.map((w) => [w.widgetId, w]));
      for (const w of incoming.layout.widgets) {
        byId.set(w.widgetId, w);
      }
      return {
        taskId: incoming.taskId,
        operation: incoming.operation,
        layout: { widgets: [...byId.values()] },
      };
    }
    case 'UPDATE_WIDGET': {
      const updates = new Map(incoming.layout.widgets.map((w) => [w.widgetId, w]));
      const widgets = baseWidgets.map((w) => updates.get(w.widgetId) ?? w);
      // also allow update-insert if widget missing? Spec: update existing only
      return {
        taskId: incoming.taskId,
        operation: incoming.operation,
        layout: { widgets },
      };
    }
    case 'REMOVE_WIDGET': {
      const remove = new Set(incoming.layout.widgets.map((w) => w.widgetId));
      return {
        taskId: incoming.taskId,
        operation: incoming.operation,
        layout: { widgets: baseWidgets.filter((w) => !remove.has(w.widgetId)) },
      };
    }
    default: {
      const _exhaustive: never = incoming.operation;
      throw new Error(`Unknown operation: ${_exhaustive}`);
    }
  }
}
