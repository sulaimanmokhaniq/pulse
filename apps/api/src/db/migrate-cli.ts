import { Pool } from 'pg';
import { loadConfig } from '../config';
import { runMigrations } from './migrate';

async function main() {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  try {
    await runMigrations(pool, console.log);
    console.log('migrations up to date');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
