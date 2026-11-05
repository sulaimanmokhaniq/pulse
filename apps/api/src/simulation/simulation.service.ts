import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, AppConfig } from '../config';
import { PG_POOL } from '../db/database.module';
import { registerKey } from '../db/seed';
import { PartitionManager, writeEvents } from '../worker/event-writer';
import { SIMULATED_PROJECT_NAME, simulatedSecretKey } from './simulated-key';
import { simulateDay } from './simulator';

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 90;
const RETENTION_DAYS = 95;
const TOP_UP_MS = 60 * 60_000;
const CHUNK = 500;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Keeps a separate "simulated" project filled with realistic demo-shop
 * traffic, so the public dashboard has something to show. It never touches
 * the live project, and writes straight to Postgres (no Redis commands).
 */
@Injectable()
export class SimulationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Simulation');
  private readonly partitions: PartitionManager;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {
    this.partitions = new PartitionManager(pool);
  }

  onApplicationBootstrap() {
    if (!this.config.simulation) return;
    // Never delays startup: the first top-up runs in the background.
    setTimeout(() => void this.topUp(), 5_000).unref();
    this.timer = setInterval(() => void this.topUp(), TOP_UP_MS);
    this.timer.unref();
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
  }

  /** Fills in every missing day up to now. Safe to run any number of times. */
  topUp(now = new Date()): Promise<void> {
    return (this.running ??= this.run(now)
      .catch((err) => this.logger.error(`top-up failed: ${err}`))
      .finally(() => (this.running = undefined)));
  }

  private async run(now: Date) {
    const projectId = await this.ensureProject();
    const today = Date.parse(isoDay(now.getTime()));
    const { rows } = await this.pool.query<{ last: string | null }>(
      `SELECT max(day)::text AS last FROM daily_event_counts WHERE project_id = $1`,
      [projectId],
    );
    // Redo the last day seen, since it may have been partial.
    const oldest = today - (HISTORY_DAYS - 1) * DAY_MS;
    const from = rows[0].last ? Math.max(Date.parse(rows[0].last), oldest) : oldest;

    let inserted = 0;
    for (let day = from; day <= today; day += DAY_MS) {
      const events = simulateDay(projectId, isoDay(day), now);
      await this.partitions.ensureFor(events.map((e) => new Date(e.timestamp)));
      for (let i = 0; i < events.length; i += CHUNK) {
        inserted += (await writeEvents(this.pool, events.slice(i, i + CHUNK))).inserted;
      }
    }
    await this.prune(projectId, now);
    if (inserted > 0) this.logger.log(`added ${inserted} simulated events`);
  }

  private async ensureProject(): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO projects (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [SIMULATED_PROJECT_NAME],
    );
    await registerKey(this.pool, rows[0].id, simulatedSecretKey(this.config.simulation!.liveSecretKey), 'secret');
    return rows[0].id;
  }

  // Keeps the free database small: only the last few months of simulated data.
  private async prune(projectId: string, now: Date) {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
    await this.pool.query('DELETE FROM events WHERE project_id = $1 AND timestamp < $2', [projectId, cutoff]);
    await this.pool.query('DELETE FROM daily_event_counts WHERE project_id = $1 AND day < $2::date', [projectId, cutoff]);
    await this.pool.query('DELETE FROM event_ids WHERE project_id = $1 AND received_at < $2', [projectId, cutoff]);
  }
}
