import type { TuiManifest, TuiUserAction } from '@visual-engine/tui-shared';

export interface TuiSessionSnapshot {
  sessionId: string;
  taskId: string;
  manifest: TuiManifest;
  updatedAt: string;
}

export type TuiOutboxStatus = 'pending' | 'sent';

export interface TuiOutboxEvent {
  id: string;
  sessionId: string;
  payload: TuiManifest;
  status: TuiOutboxStatus;
  createdAt: string;
}

export type TuiSaveResult =
  | { ok: true; snapshot: TuiSessionSnapshot; outboxEvent: TuiOutboxEvent; idempotentReplay?: boolean }
  | { ok: false; reason: string };

export interface TuiSaveInput {
  sessionId: string;
  manifest: TuiManifest;
  idempotencyKey?: string;
}

export interface TuiStoredAction {
  sessionId: string;
  action: TuiUserAction;
  createdAt: string;
}

export interface TuiStore {
  saveSessionWithOutbox(input: TuiSaveInput): Promise<TuiSaveResult>;
  getSession(sessionId: string): Promise<TuiSessionSnapshot | null>;
  listPendingOutbox(): Promise<TuiOutboxEvent[]>;
  markOutboxSent(id: string): Promise<void>;
  recordAction(sessionId: string, action: TuiUserAction): Promise<void>;
  listActions(sessionId?: string): TuiStoredAction[];
}
