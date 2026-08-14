import { InMemoryTuiStore } from './InMemoryTuiStore.js';
import { PostgresTuiStore } from './PostgresTuiStore.js';
import type { TuiStore } from './types.js';
import type pg from 'pg';

export async function createTuiStore(
  databaseUrl: string | null,
  pool?: pg.Pool,
): Promise<TuiStore> {
  if (!databaseUrl || !pool) {
    return new InMemoryTuiStore();
  }
  return new PostgresTuiStore(pool);
}

export type { TuiStore } from './types.js';
export { InMemoryTuiStore } from './InMemoryTuiStore.js';
export { PostgresTuiStore } from './PostgresTuiStore.js';
