import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';
import { isInRollout } from './bucket';

export interface Flag {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  updatedAt: string;
}

export interface FlagChanges {
  description?: string;
  enabled?: boolean;
  rolloutPercent?: number;
}

const CACHE_MS = 10_000;

const SELECT = `SELECT key, description, enabled, rollout_percent AS "rolloutPercent", updated_at AS "updatedAt"
                FROM feature_flags`;

@Injectable()
export class FlagsService {
  // Evaluation runs on every app start, so a project's flags are cached briefly.
  // Writes through this service clear the cache; other instances catch up within CACHE_MS.
  private readonly cache = new Map<string, { flags: Flag[]; at: number }>();

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(projectId: string): Promise<Flag[]> {
    const { rows } = await this.pool.query<Flag>(`${SELECT} WHERE project_id = $1 ORDER BY key`, [projectId]);
    return rows;
  }

  async get(projectId: string, key: string): Promise<Flag | null> {
    const { rows } = await this.pool.query<Flag>(`${SELECT} WHERE project_id = $1 AND key = $2`, [projectId, key]);
    return rows[0] ?? null;
  }

  async upsert(projectId: string, key: string, flag: Required<Omit<FlagChanges, 'description'>> & FlagChanges) {
    const { rows } = await this.pool.query<Flag>(
      `INSERT INTO feature_flags AS f (project_id, key, description, enabled, rollout_percent)
       VALUES ($1, $2, COALESCE($3, ''), $4, $5)
       ON CONFLICT (project_id, key) DO UPDATE SET
         description = COALESCE($3, f.description),
         enabled = EXCLUDED.enabled,
         rollout_percent = EXCLUDED.rollout_percent,
         updated_at = now()
       RETURNING key, description, enabled, rollout_percent AS "rolloutPercent", updated_at AS "updatedAt"`,
      [projectId, key, flag.description ?? null, flag.enabled, flag.rolloutPercent],
    );
    this.cache.delete(projectId);
    return rows[0];
  }

  async update(projectId: string, key: string, changes: FlagChanges): Promise<Flag | null> {
    const { rows } = await this.pool.query<Flag>(
      `UPDATE feature_flags SET
         description = COALESCE($3, description),
         enabled = COALESCE($4, enabled),
         rollout_percent = COALESCE($5, rollout_percent),
         updated_at = now()
       WHERE project_id = $1 AND key = $2
       RETURNING key, description, enabled, rollout_percent AS "rolloutPercent", updated_at AS "updatedAt"`,
      [projectId, key, changes.description ?? null, changes.enabled ?? null, changes.rolloutPercent ?? null],
    );
    this.cache.delete(projectId);
    return rows[0] ?? null;
  }

  async remove(projectId: string, key: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM feature_flags WHERE project_id = $1 AND key = $2', [projectId, key]);
    this.cache.delete(projectId);
    return res.rowCount === 1;
  }

  /** Every flag in the project resolved to on/off for one user. */
  async evaluate(projectId: string, distinctId: string): Promise<Record<string, boolean>> {
    let entry = this.cache.get(projectId);
    if (!entry || Date.now() - entry.at > CACHE_MS) {
      entry = { flags: await this.list(projectId), at: Date.now() };
      this.cache.set(projectId, entry);
    }
    const result: Record<string, boolean> = {};
    for (const f of entry.flags) {
      result[f.key] = f.enabled && isInRollout(f.key, distinctId, f.rolloutPercent);
    }
    return result;
  }
}
