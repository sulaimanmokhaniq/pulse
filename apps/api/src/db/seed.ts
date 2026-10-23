import { Pool } from 'pg';
import { displayPrefix, generateApiKey, hashApiKey } from '../auth/api-key';

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
  const inserted = await pool.query(
    `INSERT INTO api_keys (project_id, key_hash, key_prefix) VALUES ($1, $2, $3)
     ON CONFLICT (key_hash) DO NOTHING`,
    [projectId, hashApiKey(apiKey), displayPrefix(apiKey)],
  );
  return { projectId, apiKey, created: inserted.rowCount === 1 };
}
