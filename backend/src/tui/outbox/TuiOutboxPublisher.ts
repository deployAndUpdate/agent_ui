import type { TuiStore } from '../store/types.js';
import type { TuiSessionHub } from '../ws/TuiSessionHub.js';
import type { Logger } from '../../logging/logger.js';
import { createLogger } from '../../logging/logger.js';

export class TuiOutboxPublisher {
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private readonly log: Logger;

  constructor(
    private readonly store: TuiStore,
    private readonly hub: TuiSessionHub,
    logger?: Logger,
  ) {
    this.log = logger ?? createLogger('info', { component: 'tui-outbox' });
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
          this.hub.publish(event.sessionId, {
            event: 'RENDER_MANIFEST',
            payload: event.payload,
          });
          await this.store.markOutboxSent(event.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.log.error({ eventId: event.id, err: message }, 'tui outbox publish failed');
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
