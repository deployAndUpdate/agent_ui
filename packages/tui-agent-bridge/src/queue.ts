/** Serialize jobs per sessionId so one LLM turn finishes before the next. */
export class SessionQueue {
  private tails = new Map<string, Promise<void>>();
  private pending = new Map<string, number>();
  private inflight = new Set<string>();

  get busyCount(): number {
    return this.pending.size;
  }

  isBusy(sessionId: string): boolean {
    return (this.pending.get(sessionId) ?? 0) > 0;
  }

  async run<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    this.pending.set(sessionId, (this.pending.get(sessionId) ?? 0) + 1);

    const prev = this.tails.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(
      sessionId,
      prev.then(() => mine).catch(() => mine),
    );

    try {
      await prev.catch(() => undefined);
      this.inflight.add(sessionId);
      try {
        return await fn();
      } finally {
        this.inflight.delete(sessionId);
      }
    } finally {
      const n = (this.pending.get(sessionId) ?? 1) - 1;
      if (n <= 0) this.pending.delete(sessionId);
      else this.pending.set(sessionId, n);
      release();
    }
  }
}
