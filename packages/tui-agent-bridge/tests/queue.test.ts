import { describe, expect, it } from 'vitest';
import { SessionQueue } from '../src/queue.js';
import { isKnownCommand } from '../src/handlers.js';

describe('SessionQueue', () => {
  it('serializes jobs for the same sessionId', async () => {
    const q = new SessionQueue();
    const order: number[] = [];
    const slow = q.run('demo', async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push(1);
      return 'a';
    });
    const next = q.run('demo', async () => {
      order.push(2);
      return 'b';
    });
    expect(q.isBusy('demo')).toBe(true);
    expect(q.busyCount).toBe(1);
    await expect(Promise.all([slow, next])).resolves.toEqual(['a', 'b']);
    expect(order).toEqual([1, 2]);
    expect(q.isBusy('demo')).toBe(false);
    expect(q.busyCount).toBe(0);
  });

  it('allows parallel jobs on different sessions', async () => {
    const q = new SessionQueue();
    let release!: () => void;
    const held = new Promise<void>((r) => {
      release = r;
    });
    const a = q.run('s1', () => held.then(() => 'a'));
    await new Promise((r) => setTimeout(r, 5));
    const b = q.run('s2', async () => 'b');
    await expect(b).resolves.toBe('b');
    release();
    await expect(a).resolves.toBe('a');
  });
});

describe('command dispatch', () => {
  it('knows /details', () => {
    expect(isKnownCommand('/details')).toBe(true);
    expect(isKnownCommand(' /details ')).toBe(true);
    expect(isKnownCommand('/prompt')).toBe(true);
    expect(isKnownCommand('/foo')).toBe(false);
  });
});
