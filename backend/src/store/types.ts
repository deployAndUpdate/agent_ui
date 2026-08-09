import type { DashboardManifest, WidgetInteractionEvent } from '@visual-engine/shared';

export interface DashboardSnapshot {
  sessionId: string;
  version: number;
  manifest: DashboardManifest;
  updatedAt: string;
}

export type OutboxStatus = 'pending' | 'published' | 'dead';

export interface OutboxEvent {
  id: string;
  sessionId: string;
  version: number;
  manifest: DashboardManifest;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  /** @deprecated use status === 'published' */
  published: boolean;
}

export type SaveResult =
  | { ok: true; snapshot: DashboardSnapshot; outboxEvent: OutboxEvent; idempotentReplay?: boolean }
  | { ok: false; reason: 'stale_version' };

export interface SaveDashboardInput {
  sessionId: string;
  manifest: DashboardManifest;
  version: number;
  idempotencyKey?: string;
}

export interface DashboardStore {
  saveDashboardWithOutbox(input: SaveDashboardInput): Promise<SaveResult>;
  /** backward-compatible overload helpers used in tests */
  getDashboard(sessionId: string): Promise<DashboardSnapshot | null>;
  listPendingOutbox(): Promise<OutboxEvent[]>;
  markOutboxPublished(id: string): Promise<void>;
  markOutboxFailed(id: string, error: string, dead: boolean): Promise<void>;
  recordInteraction(event: WidgetInteractionEvent): Promise<void> | void;
  listInteractions(): WidgetInteractionEvent[];
}

export function isPublished(event: OutboxEvent): boolean {
  return event.status === 'published' || event.published === true;
}
