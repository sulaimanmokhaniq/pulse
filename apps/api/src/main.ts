import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { createApp } from './bootstrap';
import { loadConfig } from './config';
import { runMigrations } from './db/migrate';

async function main() {
  const config = loadConfig();
  const logger = new Logger('Pulse');

  const pool = new Pool({ connectionString: config.databaseUrl });
  await runMigrations(pool, (msg) => logger.log(msg));
  await pool.end();

  const app = await createApp(config);
  await app.listen(config.port, '0.0.0.0');
  logger.log(`listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
