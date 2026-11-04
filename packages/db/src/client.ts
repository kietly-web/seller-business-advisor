import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import type { Db } from './context';
import * as schema from './schema';

export function createDb(connectionString: string): Db {
  return drizzle({ client: new Pool({ connectionString }), schema });
}

let app: Db | undefined;
let worker: Db | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function appDb(): Db {
  app ??= createDb(requireEnv('DATABASE_URL'));
  return app;
}

export function workerDb(): Db {
  worker ??= createDb(process.env.DATABASE_URL_WORKER ?? requireEnv('DATABASE_URL'));
  return worker;
}
