import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { createApp } from './bootstrap';
import { loadConfig } from './config';
import { runMigrations } from './db/migrate';
import { seedProject } from './db/seed';

async function main() {
  const config = loadConfig();
  const logger = new Logger('Pulse');

  const pool = new Pool({ connectionString: config.databaseUrl });
  await runMigrations(pool, (msg) => logger.log(msg));
  // Free hosts often have no shell, so the Phase 1 project can be seeded from env.
  if (process.env.SEED_API_KEY) {
    const seeded = await seedProject(pool, process.env.SEED_PROJECT_NAME ?? 'Demo Shop', process.env.SEED_API_KEY);
    if (seeded.created) logger.log(`seeded project ${seeded.projectId}`);
  }
  await pool.end();

  const app = await createApp(config);
  await app.listen(config.port, '0.0.0.0');
  logger.log(`listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
