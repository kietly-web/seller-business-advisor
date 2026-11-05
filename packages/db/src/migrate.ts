import { join } from 'node:path';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';

const url = process.env.DATABASE_URL_MIGRATE;
if (!url) {
  console.error('DATABASE_URL_MIGRATE is not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: join(import.meta.dirname, '..', 'migrations') });
  console.log('Migrations applied.');
} finally {
  await pool.end();
}
