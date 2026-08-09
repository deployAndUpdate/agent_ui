import { motion } from 'framer-motion';
import type { DashboardManifest, WidgetInteractionEvent, WidgetType } from '@visual-engine/shared';
import { componentRegistry } from './registry';

export interface VisualEngineProps {
  manifest: DashboardManifest;
  onInteraction: (event: WidgetInteractionEvent) => void;
}

function UnsupportedWidget({ type }: { type: string }) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-950/40 p-3 text-sm" role="alert">
      Unsupported widget: {type}
    </div>
  );
}

const colSpan: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
};

export function VisualEngine({ manifest, onInteraction }: VisualEngineProps) {
  return (
    <div className="grid grid-cols-12 gap-4" data-testid="visual-engine">
      {manifest.layout.widgets.map((widget) => {
        const Component = componentRegistry[widget.type as WidgetType];
        const span = colSpan[widget.size.w] ?? 'col-span-12';

        return (
          <motion.div
            key={widget.widgetId}
            layout
            className={`${span} rounded-xl border border-white/10 bg-[color:var(--color-panel)]/90 p-4`}
            style={{ minHeight: `${widget.size.h * 4}rem` }}
            data-widget-id={widget.widgetId}
          >
            {Component ? (
              <Component
                widgetId={widget.widgetId}
                props={widget.props}
                onAction={(action, payload = {}) => {
                  onInteraction({
                    type: 'widget_interaction',
                    taskId: manifest.taskId,
                    widgetId: widget.widgetId,
                    action,
                    payload,
                    timestamp: new Date().toISOString(),
                  });
                }}
              />
            ) : (
              <UnsupportedWidget type={String(widget.type)} />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
