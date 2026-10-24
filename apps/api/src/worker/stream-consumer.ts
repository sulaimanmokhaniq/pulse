import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { WorkerConfig } from '../config';
import { QueuedEvent } from '../ingest/ingest.service';
import { clampTimestamp, PartitionManager, writeEvents } from './event-writer';

type StreamEntry = [id: string, fields: string[]];

const CLAIM_EVERY_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;

export function parseEntry(fields: string[]): QueuedEvent | null {
  const idx = fields.indexOf('data');
  if (idx === -1) return null;
  try {
    const e = JSON.parse(fields[idx + 1]);
    const ok =
      typeof e?.projectId === 'string' &&
      typeof e.messageId === 'string' &&
      typeof e.event === 'string' &&
      typeof e.distinctId === 'string' &&
      !Number.isNaN(Date.parse(e.timestamp)) &&
      !Number.isNaN(Date.parse(e.receivedAt));
    return ok ? (e as QueuedEvent) : null;
  } catch {
    return null;
  }
}

// Consumes the ingest stream with a consumer group, so several instances can
// share the work and a crashed instance's messages are reclaimed by others.
// A message is acked only after its batch is committed to Postgres.
export class StreamConsumer {
  private readonly logger = new Logger('Worker');
  private readonly partitions: PartitionManager;
  private running = false;
  private loop?: Promise<void>;
  private lastClaim = 0;
  private failures = 0;
  private wake?: () => void;
  private nudged = false;

  constructor(
    private readonly redis: Redis,
    private readonly pool: Pool,
    private readonly streamKey: string,
    private readonly config: WorkerConfig,
  ) {
    this.partitions = new PartitionManager(pool);
  }

  async start(): Promise<void> {
    await this.ensureGroup();
    const now = new Date();
    await this.partitions.ensureFor([now, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))]);
    this.running = true;
    this.loop = this.run();
    this.logger.log(`consuming ${this.streamKey} as ${this.config.group}/${this.config.consumer}`);
  }

  // Skip the current idle delay and poll now.
  nudge(): void {
    this.nudged = true;
    this.wake?.();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.loop;
  }

  // Processes whatever is available once. Returns the number of messages handled.
  async tick(): Promise<number> {
    let entries: StreamEntry[] = [];
    if (Date.now() - this.lastClaim > CLAIM_EVERY_MS) {
      this.lastClaim = Date.now();
      entries = await this.claimStale();
    }
    if (entries.length === 0) entries = await this.readNew();
    if (entries.length === 0) return 0;

    const events: QueuedEvent[] = [];
    const dead: StreamEntry[] = [];
    for (const entry of entries) {
      const e = parseEntry(entry[1]);
      if (e) events.push(clampTimestamp(e));
      else dead.push(entry);
    }

    await this.partitions.ensureFor(events.map((e) => new Date(e.timestamp)));
    const result = await writeEvents(this.pool, events);

    const pipeline = this.redis.pipeline();
    for (const [id, fields] of dead) {
      pipeline.xadd(this.config.deadLetterKey, 'MAXLEN', '~', 10_000, '*', 'source_id', id, ...fields);
    }
    const ids = entries.map(([id]) => id);
    pipeline.xack(this.streamKey, this.config.group, ...ids);
    // Free memory right away instead of waiting for MAXLEN trimming; this
    // matters on free-tier Redis.
    pipeline.xdel(this.streamKey, ...ids);
    await pipeline.exec();

    if (dead.length) this.logger.warn(`moved ${dead.length} malformed messages to ${this.config.deadLetterKey}`);
    if (result.duplicates) this.logger.debug(`skipped ${result.duplicates} duplicate events`);
    return entries.length;
  }

  private async run(): Promise<void> {
    let idleDelay = this.config.pollMs;
    while (this.running) {
      try {
        const handled = await this.tick();
        this.failures = 0;
        if (handled >= this.config.batchSize) continue; // likely more waiting
        idleDelay = handled > 0 ? this.config.pollMs : Math.min(idleDelay * 2, this.config.maxIdlePollMs);
        await this.sleep(idleDelay);
      } catch (err) {
        this.failures++;
        const backoff = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.failures);
        this.logger.error(`batch failed (attempt ${this.failures}), retrying in ${backoff}ms: ${err}`);
        await this.sleep(backoff);
      }
    }
  }

  // Interruptible so shutdown doesn't wait out a long idle delay.
  private sleep(ms: number): Promise<void> {
    if (this.nudged) {
      // Events arrived while the last tick was running.
      this.nudged = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.nudged = false;
        resolve();
      };
    });
  }

  private async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', this.streamKey, this.config.group, '0', 'MKSTREAM');
    } catch (err: any) {
      if (!String(err?.message).includes('BUSYGROUP')) throw err;
    }
  }

  private async readNew(): Promise<StreamEntry[]> {
    const res = (await this.redis.xreadgroup(
      'GROUP',
      this.config.group,
      this.config.consumer,
      'COUNT',
      this.config.batchSize,
      'STREAMS',
      this.streamKey,
      '>',
    )) as [string, StreamEntry[]][] | null;
    return res?.[0]?.[1] ?? [];
  }

  private async claimStale(): Promise<StreamEntry[]> {
    const res = (await this.redis.xautoclaim(
      this.streamKey,
      this.config.group,
      this.config.consumer,
      this.config.claimIdleMs,
      '0',
      'COUNT',
      this.config.batchSize,
    )) as [string, (StreamEntry | null)[]];
    // Entries deleted while pending come back as null.
    return (res?.[1] ?? []).filter((e): e is StreamEntry => Array.isArray(e));
  }
}
