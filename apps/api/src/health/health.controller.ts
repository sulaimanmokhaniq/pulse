import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';
import { REDIS } from '../redis/redis.module';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.allSettled([this.pool.query('SELECT 1'), this.redis.ping()]);
    const status = { db: db.status === 'fulfilled', redis: redis.status === 'fulfilled' };
    if (!status.db || !status.redis) throw new ServiceUnavailableException({ ok: false, ...status });
    return { ok: true, ...status };
  }
}
