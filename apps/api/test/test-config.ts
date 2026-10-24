import { randomUUID } from 'crypto';
import { AppConfig } from '../src/config';

// Each suite gets its own stream key so suites can run in parallel.
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const streamKey = `pulse:test:${randomUUID()}`;
  return {
    port: 0,
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/pulse_test',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379/15',
    streamKey,
    streamMaxLen: 1000,
    rateLimitPerMinute: 1000,
    maxBodyBytes: '512kb',
    ...overrides,
    worker: {
      enabled: false,
      group: 'pulse-test',
      consumer: 'test-consumer',
      batchSize: 100,
      pollMs: 50,
      maxIdlePollMs: 200,
      claimIdleMs: 60_000,
      deadLetterKey: `${streamKey}:dead`,
      ...overrides.worker,
    },
  };
}
