import { randomUUID } from 'crypto';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { generateApiKey } from '../src/auth/api-key';
import { configureApp } from '../src/bootstrap';
import { runMigrations } from '../src/db/migrate';
import { registerKey, seedDemoFlags, seedProject } from '../src/db/seed';
import { isInRollout } from '../src/flags/bucket';
import { testConfig } from './test-config';

describe('feature flags', () => {
  const config = testConfig();
  let app: NestExpressApplication;
  let pool: Pool;
  let projectId: string;
  let ingestKey: string;
  const secretKey = generateApiKey('secret');

  const http = () => request(app.getHttpServer());
  const admin = (method: 'get' | 'put' | 'patch' | 'delete', path: string) =>
    http()[method](path).set('Authorization', `Bearer ${secretKey}`);
  const evaluate = (distinctId: string, key = ingestKey) =>
    http().post('/v1/flags/evaluate').set('Authorization', `Bearer ${key}`).send({ distinctId });

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.databaseUrl });
    await runMigrations(pool);
    ({ projectId, apiKey: ingestKey } = await seedProject(pool, `flags-${randomUUID()}`));
    await registerKey(pool, projectId, secretKey, 'secret');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('keeps key kinds apart', async () => {
    await http().get('/v1/flags').set('Authorization', `Bearer ${ingestKey}`).expect(401);
    await evaluate('anon-1', secretKey).expect(401);
    await http().post('/v1/flags/evaluate').send({ distinctId: 'x' }).expect(401);
  });

  it('creates, lists, updates and deletes a flag', async () => {
    const created = await admin('put', '/v1/flags/new_checkout')
      .send({ description: 'Checkout v2', enabled: true, rolloutPercent: 100 })
      .expect(200);
    expect(created.body).toMatchObject({ key: 'new_checkout', description: 'Checkout v2', enabled: true, rolloutPercent: 100 });

    const list = await admin('get', '/v1/flags').expect(200);
    expect(list.body.flags.map((f: { key: string }) => f.key)).toEqual(['new_checkout']);

    const patched = await admin('patch', '/v1/flags/new_checkout').send({ enabled: false }).expect(200);
    expect(patched.body).toMatchObject({ enabled: false, rolloutPercent: 100, description: 'Checkout v2' });

    await admin('patch', '/v1/flags/missing').send({ enabled: true }).expect(404);
    await admin('delete', '/v1/flags/new_checkout').expect(204);
    await admin('get', '/v1/flags/new_checkout').expect(404);
  });

  it('validates keys and bodies', async () => {
    await admin('put', '/v1/flags/Bad%20Key').send({ enabled: true, rolloutPercent: 10 }).expect(400);
    await admin('put', '/v1/flags/ok').send({ enabled: true, rolloutPercent: 101 }).expect(400);
    await admin('put', '/v1/flags/ok').send({ enabled: 'yes', rolloutPercent: 10 }).expect(400);
    await evaluate('').expect(400);
  });

  it('evaluates flags per user, honouring enabled and rollout', async () => {
    await admin('put', '/v1/flags/everyone').send({ enabled: true, rolloutPercent: 100 }).expect(200);
    await admin('put', '/v1/flags/nobody').send({ enabled: false, rolloutPercent: 100 }).expect(200);
    await admin('put', '/v1/flags/half').send({ enabled: true, rolloutPercent: 50 }).expect(200);

    const ids = Array.from({ length: 40 }, (_, i) => `anon-${i}`);
    for (const id of ids) {
      const res = await evaluate(id).expect(200);
      expect(res.body.flags).toEqual({ everyone: true, nobody: false, half: isInRollout('half', id, 50) });
    }
  });

  it('sees changes immediately after a write', async () => {
    await admin('put', '/v1/flags/switch').send({ enabled: true, rolloutPercent: 100 }).expect(200);
    expect((await evaluate('anon-x')).body.flags.switch).toBe(true);
    await admin('patch', '/v1/flags/switch').send({ enabled: false }).expect(200);
    expect((await evaluate('anon-x')).body.flags.switch).toBe(false);
  });

  it('seeds the demo flag once and keeps later edits', async () => {
    await seedDemoFlags(pool, projectId);
    await admin('patch', '/v1/flags/promo_banner').send({ rolloutPercent: 80 }).expect(200);
    await seedDemoFlags(pool, projectId);
    const flag = await admin('get', '/v1/flags/promo_banner').expect(200);
    expect(flag.body).toMatchObject({ enabled: true, rolloutPercent: 80 });
  });
});
