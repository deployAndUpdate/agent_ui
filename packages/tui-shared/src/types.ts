export type TuiManifestOperation =
  | 'SYNC_DASHBOARD'
  | 'ADD_WIDGET'
  | 'UPDATE_WIDGET'
  | 'REMOVE_WIDGET';

export type TuiWidgetType = 'Paragraph' | 'Table' | 'List' | 'Gauge' | 'Chart';

export type TuiLayoutDirection = 'vertical' | 'horizontal';

export interface TuiChunk {
  widgetId: string;
  type: TuiWidgetType;
  size: number;
  props: Record<string, unknown>;
}

export interface TuiManifest {
  taskId: string;
  operation: TuiManifestOperation;
  layout: {
    direction?: TuiLayoutDirection;
    chunks: TuiChunk[];
  };
}

export interface TuiUserAction {
  event: 'USER_ACTION';
  taskId: string;
  widgetId: string;
  /** Known: select_row | navigate_back (extensible string). */
  action: string;
  payload: Record<string, unknown>;
}

export interface TuiRenderManifestMessage {
  event: 'RENDER_MANIFEST';
  payload: TuiManifest;
}

export type ValidationSuccess<T> = { ok: true; data: T };
export type ValidationFailure = { ok: false; errors: string[] };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;
