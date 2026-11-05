import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { generateApiKey } from '../src/auth/api-key';
import { configureApp } from '../src/bootstrap';
import { runMigrations } from '../src/db/migrate';
import { simulatedSecretKey, SIMULATED_PROJECT_NAME } from '../src/simulation/simulated-key';
import { SimulationService } from '../src/simulation/simulation.service';
import { testConfig } from './test-config';

describe('simulated traffic', () => {
  const liveSecretKey = generateApiKey('secret');
  const config = testConfig({ simulation: { liveSecretKey } });
  let app: NestExpressApplication;
  let pool: Pool;

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${simulatedSecretKey(liveSecretKey)}`);

  beforeAll(async () => {
    pool = new Pool({ connectionString: config.databaseUrl });
    await runMigrations(pool);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('fills 90 days for the simulated project, readable with the derived key', async () => {
    await app.get(SimulationService).topUp();

    const events = await get('/v1/query/events').expect(200);
    const names = events.body.events.map((e: { event: string }) => e.event);
    expect(names).toEqual(expect.arrayContaining(['app_opened', 'product_viewed', 'purchase_completed', '$feature_flag_called']));

    const trend = await get('/v1/query/trends?event=app_opened&days=30').expect(200);
    const pastDays = trend.body.series.slice(0, -1);
    expect(pastDays.every((p: { count: number }) => p.count > 20)).toBe(true);
    expect(trend.body.users).toBeLessThan(trend.body.total);
  }, 120_000);

  it('is idempotent: running again adds nothing', async () => {
    const count = async () =>
      (
        await pool.query<{ n: string }>(
          `SELECT count(*) AS n FROM events e JOIN projects p ON p.id = e.project_id WHERE p.name = $1`,
          [SIMULATED_PROJECT_NAME],
        )
      ).rows[0].n;
    const before = await count();
    // Same instant as far as "today" goes, so nothing new is due.
    await app.get(SimulationService).topUp(new Date(Date.now() - 60_000));
    expect(await count()).toBe(before);
  }, 120_000);
});
