import { hostname } from 'os';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  streamKey: string;
  streamMaxLen: number;
  rateLimitPerMinute: number;
  maxBodyBytes: string;
  worker: WorkerConfig;
}

export interface WorkerConfig {
  enabled: boolean;
  group: string;
  consumer: string;
  batchSize: number;
  pollMs: number;
  maxIdlePollMs: number;
  claimIdleMs: number;
  deadLetterKey: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    streamKey: process.env.STREAM_KEY ?? 'pulse:events',
    // Approximate cap on the stream so a stalled worker cannot exhaust Redis memory.
    streamMaxLen: Number(process.env.STREAM_MAXLEN ?? 100_000),
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600),
    maxBodyBytes: process.env.MAX_BODY_BYTES ?? '512kb',
    worker: {
      // Runs inside the API process by default so a single free web service is enough.
      enabled: (process.env.WORKER_ENABLED ?? 'true') !== 'false',
      group: process.env.WORKER_GROUP ?? 'pulse-workers',
      consumer: process.env.WORKER_CONSUMER ?? `${hostname()}-${process.pid}`,
      batchSize: Number(process.env.WORKER_BATCH_SIZE ?? 500),
      // Poll interval while busy; doubles while idle up to maxIdlePollMs, which
      // keeps command counts low on metered Redis such as Upstash.
      pollMs: Number(process.env.WORKER_POLL_MS ?? 1000),
      maxIdlePollMs: Number(process.env.WORKER_MAX_IDLE_POLL_MS ?? 30_000),
      // Messages unacked this long are assumed orphaned by a crashed consumer.
      claimIdleMs: Number(process.env.WORKER_CLAIM_IDLE_MS ?? 60_000),
      deadLetterKey: process.env.DEAD_LETTER_KEY ?? 'pulse:events:dead',
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
