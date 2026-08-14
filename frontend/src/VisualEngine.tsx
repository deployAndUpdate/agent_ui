import { motion } from 'framer-motion';
import {
  manifestToScene,
  type DashboardManifest,
  type SceneNode,
  type WidgetInteractionEvent,
  type WidgetType,
} from '@visual-engine/shared';
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

function SceneNodeView({
  node,
  taskId,
  onInteraction,
}: {
  node: SceneNode;
  taskId: string;
  onInteraction: (event: WidgetInteractionEvent) => void;
}) {
  const Component = componentRegistry[node.type as WidgetType];
  const span = colSpan[node.colSpan] ?? 'col-span-12';

  return (
    <motion.div
      key={node.widgetId}
      layout
      className={`${span} vision-card rounded-2xl p-4 ${node.traits.hero ? 'vision-card-hero' : ''}`}
      style={{ minHeight: `${node.minHeightUnits}rem` }}
      data-widget-id={node.widgetId}
    >
      {Component ? (
        <Component
          widgetId={node.widgetId}
          props={node.props}
          onAction={(action, payload = {}) => {
            onInteraction({
              type: 'widget_interaction',
              taskId,
              widgetId: node.widgetId,
              action,
              payload,
              timestamp: new Date().toISOString(),
            });
          }}
        />
      ) : (
        <UnsupportedWidget type={String(node.type)} />
      )}
    </motion.div>
  );
}

/** React adapter of RendererPort: Manifest → Scene → DOM widgets. */
export function VisualEngine({ manifest, onInteraction }: VisualEngineProps) {
  const scene = manifestToScene(manifest);

  return (
    <div
      className="grid grid-cols-12 gap-4"
      data-testid="visual-engine"
      data-scene-schema={scene.schemaVersion}
    >
      {scene.nodes.map((node) => (
        <SceneNodeView
          key={node.widgetId}
          node={node}
          taskId={scene.taskId}
          onInteraction={onInteraction}
        />
      ))}
    </div>
  );
}
