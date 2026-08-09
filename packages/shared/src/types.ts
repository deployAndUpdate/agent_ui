export type ManifestOperation =
  | 'SYNC_DASHBOARD'
  | 'ADD_WIDGET'
  | 'UPDATE_WIDGET'
  | 'REMOVE_WIDGET';

export type WidgetType = 'MetricCard' | 'DataChart' | 'ActionLog' | 'DataTable';

export interface WidgetSize {
  w: number;
  h: number;
}

export interface WidgetManifest {
  widgetId: string;
  type: WidgetType;
  size: WidgetSize;
  props: Record<string, unknown>;
}

export interface DashboardManifest {
  taskId: string;
  operation: ManifestOperation;
  layout: {
    widgets: WidgetManifest[];
  };
}

export interface WidgetInteractionEvent {
  type: 'widget_interaction';
  taskId: string;
  widgetId: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export type ValidationSuccess = { ok: true; data: DashboardManifest };
export type ValidationFailure = { ok: false; errors: string[] };
export type ValidationResult = ValidationSuccess | ValidationFailure;
