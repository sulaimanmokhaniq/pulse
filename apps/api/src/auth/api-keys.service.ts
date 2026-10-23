import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';
import { hashApiKey } from './api-key';

export interface ResolvedKey {
  keyId: string;
  projectId: string;
}

const CACHE_TTL_MS = 60_000;

// Every ingest request is authenticated, so lookups are cached briefly to keep
// the hot path off the database. A revoked key stops working within a minute.
@Injectable()
export class ApiKeysService {
  private readonly cache = new Map<string, { value: ResolvedKey | null; expiresAt: number }>();

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async resolve(rawKey: string): Promise<ResolvedKey | null> {
    const hash = hashApiKey(rawKey);
    const cached = this.cache.get(hash);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const { rows } = await this.pool.query<{ id: string; project_id: string }>(
      'SELECT id, project_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
      [hash],
    );
    const value = rows[0] ? { keyId: rows[0].id, projectId: rows[0].project_id } : null;
    this.cache.set(hash, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }
}
