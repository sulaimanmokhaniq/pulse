import { Pool } from 'pg';
import { loadConfig } from '../config';
import { runMigrations } from './migrate';
import { seedProject } from './seed';

async function main() {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  try {
    await runMigrations(pool);
    const name = process.env.SEED_PROJECT_NAME ?? 'Demo Shop';
    const result = await seedProject(pool, name, process.env.SEED_API_KEY || undefined);
    console.log(`project "${name}" ${result.projectId}`);
    if (result.created && !process.env.SEED_API_KEY) {
      console.log(`new API key (shown once): ${result.apiKey}`);
    } else {
      console.log(result.created ? 'API key registered' : 'API key already registered');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
