import { describe, expect, it } from 'vitest';
import { assertSessionId, sessionIdError } from '../../src/tui/sessionId.js';

describe('sessionId', () => {
  it('accepts demo-like ids', () => {
    expect(assertSessionId('demo')).toBe(true);
    expect(assertSessionId('demo_1')).toBe(true);
    expect(assertSessionId('a.b:c-d')).toBe(true);
  });

  it('rejects empty and weird ids', () => {
    expect(assertSessionId('')).toBe(false);
    expect(assertSessionId('has space')).toBe(false);
    expect(assertSessionId('x'.repeat(65))).toBe(false);
    expect(sessionIdError('')).toMatch(/required/);
  });
});
