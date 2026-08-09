import type { DashboardStore } from '../store/types.js';
import type { SessionHub } from '../ws/SessionHub.js';
import type { Logger } from '../logging/logger.js';
import { createLogger } from '../logging/logger.js';

export class OutboxPublisher {
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private readonly log: Logger;

  constructor(
    private readonly store: DashboardStore,
    private readonly hub: SessionHub,
    private readonly maxAttempts = 5,
    logger?: Logger,
  ) {
    this.log = logger ?? createLogger('info', { component: 'outbox' });
  }

  start(intervalMs = 50): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.drain();
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const pending = await this.store.listPendingOutbox();
      for (const event of pending) {
        try {
          this.hub.publish({
            type: 'dashboard_update',
            sessionId: event.sessionId,
            version: event.version,
            manifest: event.manifest,
          });
          await this.store.markOutboxPublished(event.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const nextAttempts = event.attempts + 1;
          const dead = nextAttempts >= this.maxAttempts;
          await this.store.markOutboxFailed(event.id, message, dead);
          this.log.error(
            { eventId: event.id, attempts: nextAttempts, dead, err: message },
            'outbox publish failed',
          );
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
