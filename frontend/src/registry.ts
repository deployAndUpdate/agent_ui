import type { ComponentType } from 'react';
import type { WidgetType } from '@visual-engine/shared';
import { MetricCard } from './widgets/MetricCard';
import { DataChart } from './widgets/DataChart';
import { ActionLog } from './widgets/ActionLog';
import { DataTable } from './widgets/DataTable';

export interface WidgetViewProps {
  widgetId: string;
  props: Record<string, unknown>;
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
}

export const componentRegistry: Record<WidgetType, ComponentType<WidgetViewProps>> = {
  MetricCard,
  DataChart,
  ActionLog,
  DataTable,
};
