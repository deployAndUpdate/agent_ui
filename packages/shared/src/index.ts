export type {
  DashboardManifest,
  ManifestOperation,
  ValidationFailure,
  ValidationResult,
  ValidationSuccess,
  WidgetInteractionEvent,
  WidgetManifest,
  WidgetSize,
  WidgetType,
} from './types.js';
export type {
  DashboardScene,
  SceneGrid,
  SceneNode,
  SceneNodeTraits,
} from './scene.js';
export { manifestToScene } from './scene.js';
export type { RendererPort } from './renderer.js';
export { validateManifest } from './validateManifest.js';
export { applyLayoutOperation } from './applyLayoutOperation.js';
