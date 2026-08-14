import type { DashboardManifest, WidgetType } from './types.js';

/** Platform-neutral presentation tree. GUI toolkits only consume this. */
export interface DashboardScene {
  schemaVersion: 1;
  taskId: string;
  grid: SceneGrid;
  nodes: SceneNode[];
}

export interface SceneGrid {
  columns: 12;
  /** Logical gap; toolkit maps to px/dp. */
  gapUnits: number;
}

export interface SceneNodeTraits {
  /** MetricCard with imageUrl — hero treatment in toolkit themes. */
  hero: boolean;
}

export interface SceneNode {
  widgetId: string;
  type: WidgetType;
  colSpan: number;
  rowSpan: number;
  /** Logical min height (manifest size.h * 4); toolkit maps to px. */
  minHeightUnits: number;
  props: Record<string, unknown>;
  traits: SceneNodeTraits;
}

const GRID_COLUMNS = 12 as const;
const DEFAULT_GAP_UNITS = 1;
const HEIGHT_UNIT_FACTOR = 4;

function clampColSpan(w: number): number {
  if (!Number.isFinite(w) || w < 1) return 1;
  if (w > GRID_COLUMNS) return GRID_COLUMNS;
  return Math.floor(w);
}

function clampRowSpan(h: number): number {
  if (!Number.isFinite(h) || h < 1) return 1;
  return Math.floor(h);
}

function isHeroMetric(type: WidgetType, props: Record<string, unknown>): boolean {
  return type === 'MetricCard' && typeof props.imageUrl === 'string' && props.imageUrl.length > 0;
}

/**
 * Compile a validated (or trusted) DashboardManifest into a Scene Graph.
 * Renderers must not interpret Manifest operations — only Scene nodes.
 */
export function manifestToScene(manifest: DashboardManifest): DashboardScene {
  return {
    schemaVersion: 1,
    taskId: manifest.taskId,
    grid: {
      columns: GRID_COLUMNS,
      gapUnits: DEFAULT_GAP_UNITS,
    },
    nodes: manifest.layout.widgets.map((widget) => {
      const colSpan = clampColSpan(widget.size.w);
      const rowSpan = clampRowSpan(widget.size.h);
      return {
        widgetId: widget.widgetId,
        type: widget.type,
        colSpan,
        rowSpan,
        minHeightUnits: rowSpan * HEIGHT_UNIT_FACTOR,
        props: { ...widget.props },
        traits: {
          hero: isHeroMetric(widget.type, widget.props),
        },
      };
    }),
  };
}
