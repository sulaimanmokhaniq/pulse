import { Global, Inject, Module, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';
import { PG_POOL } from '../db/database.module';
import { REDIS } from '../redis/redis.module';
import { StreamConsumer } from './stream-consumer';
import { WorkerSignal } from './worker-signal';

@Global()
@Module({ providers: [WorkerSignal], exports: [WorkerSignal] })
export class WorkerModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private consumer?: StreamConsumer;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly signal: WorkerSignal,
  ) {}

  async onApplicationBootstrap() {
    if (!this.config.worker.enabled) return;
    // Reads never use BLOCK, so the worker can share the API's Redis connection.
    this.consumer = new StreamConsumer(this.redis, this.pool, this.config.streamKey, this.config.worker);
    await this.consumer.start();
    this.signal.onNotify(() => this.consumer?.nudge());
  }

  // Runs before DatabaseModule/RedisModule close their connections.
  async onApplicationShutdown() {
    await this.consumer?.stop();
  }
}
