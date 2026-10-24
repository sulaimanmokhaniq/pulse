import { randomUUID } from 'crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { runMigrations } from '../src/db/migrate';
import { seedProject } from '../src/db/seed';
import { testConfig } from './test-config';

const config = testConfig({ rateLimitPerMinute: 5 });

function trackEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'track',
    messageId: randomUUID(),
    event: 'product_viewed',
    distinctId: 'anon-123',
    properties: { productId: 'sku-1' },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('POST /v1/batch', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let redis: Redis;
  let apiKey: string;
  let projectId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.databaseUrl });
    redis = new Redis(config.redisUrl);
    await runMigrations(pool);
    ({ apiKey, projectId } = await seedProject(pool, `e2e-${randomUUID()}`));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    await redis.del(config.streamKey);
    await app.close();
    await redis.quit();
    await pool.end();
  });

  it('rejects requests without a key', async () => {
    await request(app.getHttpServer()).post('/v1/batch').send({ batch: [trackEvent()] }).expect(401);
  });

  it('rejects unknown keys', async () => {
    await request(app.getHttpServer())
      .post('/v1/batch')
      .set('Authorization', 'Bearer pk_doesnotexist')
      .send({ batch: [trackEvent()] })
      .expect(401);
  });

  it('rejects invalid payloads', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/batch')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ batch: [trackEvent({ event: undefined }), trackEvent({ messageId: 'nope' })] })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('event');
  });

  it('accepts a batch and enqueues it on the stream', async () => {
    const events = [trackEvent(), { ...trackEvent(), type: 'identify', event: undefined, userId: 'user-1', traits: { plan: 'free' } }];
    const res = await request(app.getHttpServer())
      .post('/v1/batch')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ batch: events, sentAt: new Date().toISOString() })
      .expect(202);
    expect(res.body).toEqual({ accepted: 2 });

    const entries = await redis.xrange(config.streamKey, '-', '+');
    const queued = entries.map(([, fields]) => JSON.parse(fields[1]));
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({ projectId, event: 'product_viewed', distinctId: 'anon-123' });
    expect(queued[1]).toMatchObject({ projectId, event: '$identify', userId: 'user-1', traits: { plan: 'free' } });
  });

  it('rate-limits per API key', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/v1/batch')
        .set('x-api-key', apiKey)
        .send({ batch: [trackEvent()] });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  it('reports health', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { ok: true, db: true, redis: true });
  });
});
