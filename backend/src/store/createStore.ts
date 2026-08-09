import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { InMemoryDashboardStore } from './InMemoryDashboardStore.js';
import { PostgresDashboardStore } from './PostgresDashboardStore.js';
import type { DashboardStore } from './types.js';

const { Pool } = pg;

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.resolve(here, '../../migrations');
    const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

export async function createStore(databaseUrl: string | null): Promise<{
  store: DashboardStore;
  pool?: pg.Pool;
}> {
  if (!databaseUrl) {
    return { store: new InMemoryDashboardStore() };
  }
  await runMigrations(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });
  return { store: new PostgresDashboardStore(pool), pool };
}
