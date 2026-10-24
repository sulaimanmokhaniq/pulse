import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { runMigrations } from '../src/db/migrate';
import { seedProject } from '../src/db/seed';
import { QueuedEvent } from '../src/ingest/ingest.service';
import { StreamConsumer } from '../src/worker/stream-consumer';
import { testConfig } from './test-config';

describe('StreamConsumer', () => {
  const config = testConfig();
  let pool: Pool;
  let redis: Redis;
  let consumer: StreamConsumer;
  let projectId: string;

  function event(overrides: Partial<QueuedEvent> = {}): QueuedEvent {
    const now = new Date().toISOString();
    return {
      projectId,
      messageId: randomUUID(),
      type: 'track',
      event: 'product_viewed',
      distinctId: 'anon-1',
      userId: null,
      properties: { sku: 'a' },
      traits: {},
      context: {},
      timestamp: now,
      receivedAt: now,
      ...overrides,
    };
  }

  const enqueue = (...events: QueuedEvent[]) =>
    Promise.all(events.map((e) => redis.xadd(config.streamKey, '*', 'data', JSON.stringify(e))));

  async function rollup(name: string): Promise<number> {
    const { rows } = await pool.query(
      'SELECT COALESCE(SUM(count), 0)::int AS n FROM daily_event_counts WHERE project_id = $1 AND event = $2',
      [projectId, name],
    );
    return rows[0].n;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.databaseUrl });
    redis = new Redis(config.redisUrl);
    await runMigrations(pool);
    ({ projectId } = await seedProject(pool, `worker-${randomUUID()}`));
    consumer = new StreamConsumer(redis, pool, config.streamKey, config.worker);
    await consumer.start();
    await consumer.stop(); // drive it manually with tick()
  });

  afterAll(async () => {
    await redis.del(config.streamKey, config.worker.deadLetterKey);
    await redis.quit();
    await pool.end();
  });

  it('stores events, rollups and persons, then acks and deletes them', async () => {
    await enqueue(
      event(),
      event(),
      event({ type: 'identify', event: '$identify', userId: 'user-1', traits: { plan: 'free' } }),
    );
    expect(await consumer.tick()).toBe(3);

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM events WHERE project_id = $1', [projectId]);
    expect(rows[0].n).toBe(3);
    expect(await rollup('product_viewed')).toBe(2);

    const person = await pool.query('SELECT user_id, traits FROM persons WHERE project_id = $1 AND distinct_id = $2', [
      projectId,
      'anon-1',
    ]);
    expect(person.rows[0]).toEqual({ user_id: 'user-1', traits: { plan: 'free' } });
    expect(await redis.xlen(config.streamKey)).toBe(0);
  });

  it('does not double count a redelivered message', async () => {
    const e = event({ event: 'checkout' });
    await enqueue(e);
    await consumer.tick();
    await enqueue(e); // SDK retry after a lost response
    await consumer.tick();
    expect(await rollup('checkout')).toBe(1);
  });

  it('dedupes a retry whose skew-corrected timestamp shifted', async () => {
    const e = event({ event: 'retried' });
    await enqueue(e, { ...e, timestamp: new Date(Date.parse(e.timestamp) + 37).toISOString() });
    await consumer.tick();
    expect(await rollup('retried')).toBe(1);
  });

  it('lands events in a monthly partition, not the default one', async () => {
    const e = event({ event: 'old_offline_event', timestamp: new Date(Date.now() - 40 * 86_400_000).toISOString() });
    await enqueue(e);
    await consumer.tick();
    const { rows } = await pool.query('SELECT tableoid::regclass::text AS part FROM events WHERE message_id = $1', [
      e.messageId,
    ]);
    expect(rows[0].part).toMatch(/^events_y\d{4}m\d{2}$/);
  });

  it('moves malformed messages to the dead-letter stream', async () => {
    await redis.xadd(config.streamKey, '*', 'data', '{broken');
    expect(await consumer.tick()).toBe(1);
    expect(await redis.xlen(config.worker.deadLetterKey)).toBe(1);
    expect(await redis.xlen(config.streamKey)).toBe(0);
  });

  it('reclaims messages left pending by a crashed consumer', async () => {
    const e = event({ event: 'orphaned' });
    await enqueue(e);
    // Another consumer reads it and dies before acking.
    await redis.xreadgroup('GROUP', config.worker.group, 'crashed', 'COUNT', 10, 'STREAMS', config.streamKey, '>');
    const rescuer = new StreamConsumer(redis, pool, config.streamKey, { ...config.worker, claimIdleMs: 0 });
    expect(await rescuer.tick()).toBe(1);
    expect(await rollup('orphaned')).toBe(1);
  });
});
