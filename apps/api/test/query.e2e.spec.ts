import { randomUUID } from 'crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { generateApiKey } from '../src/auth/api-key';
import { configureApp } from '../src/bootstrap';
import { runMigrations } from '../src/db/migrate';
import { registerKey, seedProject } from '../src/db/seed';
import { QueuedEvent } from '../src/ingest/ingest.service';
import { PartitionManager, writeEvents } from '../src/worker/event-writer';
import { testConfig } from './test-config';

const DAY = 86_400_000;

describe('GET /v1/query', () => {
  const config = testConfig();
  let app: NestExpressApplication;
  let pool: Pool;
  let projectId: string;
  let ingestKey: string;
  const secretKey = generateApiKey('secret');

  function event(name: string, distinctId: string, daysAgo: number, extra: Partial<QueuedEvent> = {}): QueuedEvent {
    const ts = new Date(Date.now() - daysAgo * DAY).toISOString();
    return {
      projectId,
      messageId: randomUUID(),
      type: 'track',
      event: name,
      distinctId,
      userId: null,
      properties: {},
      traits: {},
      context: {},
      timestamp: ts,
      receivedAt: ts,
      ...extra,
    };
  }

  const get = (path: string, key = secretKey) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${key}`);

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.databaseUrl });
    await runMigrations(pool);
    ({ projectId, apiKey: ingestKey } = await seedProject(pool, `query-${randomUUID()}`));
    await registerKey(pool, projectId, secretKey, 'secret');

    const events = [
      event('product_viewed', 'anon-a', 0),
      event('product_viewed', 'anon-a', 0),
      event('product_viewed', 'anon-b', 0),
      // anon-c signs in as user-1 today; their anonymous and identified views count as one user.
      event('product_viewed', 'anon-c', 0),
      event('$identify', 'anon-c', 0, { type: 'identify', userId: 'user-1' }),
      event('product_viewed', 'user-1', 0, { userId: 'user-1' }),
      event('product_viewed', 'anon-a', 2),
      event('checkout', 'anon-a', 1),
      event('product_viewed', 'anon-z', 45), // outside the 30-day window
    ];
    await new PartitionManager(pool).ensureFor(events.map((e) => new Date(e.timestamp)));
    await writeEvents(pool, events);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('requires a secret key; ingest keys cannot read', async () => {
    await request(app.getHttpServer()).get('/v1/query/events').expect(401);
    await get('/v1/query/events', ingestKey).expect(401);
    // An sk_-looking string that is really an ingest key's hash is still rejected.
    await get('/v1/query/events', 'sk_' + ingestKey.slice(3)).expect(401);
  });

  it('secret keys cannot send events', async () => {
    await request(app.getHttpServer())
      .post('/v1/batch')
      .set('Authorization', `Bearer ${secretKey}`)
      .send({ batch: [] })
      .expect(401);
  });

  it('lists events by volume over the last 90 days', async () => {
    const res = await get('/v1/query/events').expect(200);
    expect(res.body.events.map((e: { event: string }) => e.event)).toEqual(['product_viewed', '$identify', 'checkout']);
    expect(res.body.events[0].total).toBe(7); // 5 today, 1 two days ago, 1 at 45 days
  });

  it('returns a zero-filled daily trend with identity-resolved users', async () => {
    const res = await get('/v1/query/trends?event=product_viewed&days=30').expect(200);
    const { series, total, users, days } = res.body;
    expect(days).toBe(30);
    expect(series).toHaveLength(30);
    expect(series.at(-1)).toMatchObject({ count: 5, users: 3 }); // anon-a, anon-b, user-1
    expect(series.at(-3)).toMatchObject({ count: 1, users: 1 });
    expect(series.at(-2)).toMatchObject({ count: 0, users: 0 });
    expect(total).toBe(6);
    expect(users).toBe(3);
  });

  it('validates the range and event', async () => {
    await get('/v1/query/trends?event=product_viewed&days=14').expect(400);
    await get('/v1/query/trends?days=30').expect(400);
  });
});
