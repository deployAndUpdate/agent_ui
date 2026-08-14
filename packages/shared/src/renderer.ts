import type { WidgetInteractionEvent } from './types.js';
import type { DashboardScene } from './scene.js';

/**
 * Pluggable GUI backend for the web track. Engine Core never imports toolkit widgets.
 */
export interface RendererPort {
  /** Stable id: `react` | custom. */
  readonly id: string;

  /** Optional toolkit-specific mount target (DOM node, …). */
  mount(containerHint?: unknown): void | Promise<void>;

  /** Replace the entire scene (SDUI full sync). */
  render(scene: DashboardScene): void;

  setInteractionHandler(handler: (event: WidgetInteractionEvent) => void): void;

  unmount(): void;
}
