import { Pool } from 'pg';
import { displayPrefix, generateApiKey, hashApiKey, KeyKind } from '../auth/api-key';

export interface SeedResult {
  projectId: string;
  apiKey: string;
  created: boolean;
}

// Phase 1 runs a single project. The key comes from SEED_API_KEY so it can be
// shared with the demo app; otherwise a fresh key is generated and printed once.
export async function seedProject(pool: Pool, name: string, apiKey = generateApiKey()): Promise<SeedResult> {
  const project = await pool.query<{ id: string }>(
    `INSERT INTO projects (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name],
  );
  const projectId = project.rows[0].id;
  const created = await registerKey(pool, projectId, apiKey, 'ingest');
  return { projectId, apiKey, created };
}

/** Stores a key's hash. Returns false if it was already registered. */
export async function registerKey(pool: Pool, projectId: string, key: string, kind: KeyKind): Promise<boolean> {
  const inserted = await pool.query(
    `INSERT INTO api_keys (project_id, key_hash, key_prefix, kind) VALUES ($1, $2, $3, $4)
     ON CONFLICT (key_hash) DO NOTHING`,
    [projectId, hashApiKey(key), displayPrefix(key), kind],
  );
  return inserted.rowCount === 1;
}

/** The demo shop's flag. Created once; later changes made in the dashboard are kept. */
export async function seedDemoFlags(pool: Pool, projectId: string): Promise<void> {
  await pool.query(
    `INSERT INTO feature_flags (project_id, key, description, enabled, rollout_percent)
     VALUES ($1, 'promo_banner', 'Free-shipping banner on the demo shop home screen', true, 50)
     ON CONFLICT (project_id, key) DO NOTHING`,
    [projectId],
  );
}
