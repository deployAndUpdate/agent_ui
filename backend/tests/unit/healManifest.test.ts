import { describe, expect, it } from 'vitest';
import { healManifest } from '../../src/agent/healManifest.js';
import invalidManifest from '../fixtures/manifest.invalid.json';
import { validateManifest } from '@visual-engine/shared';

describe('healManifest (unit / mock AI)', () => {
  it('turns invalid fixture into a schema-valid manifest', () => {
    const before = validateManifest(invalidManifest);
    expect(before.ok).toBe(false);

    const healed = healManifest(invalidManifest, before.ok ? [] : before.errors);
    const after = validateManifest(healed);
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.data.operation).toBe('SYNC_DASHBOARD');
      expect(after.data.layout.widgets[0].size.w).toBeLessThanOrEqual(12);
    }
  });
});
