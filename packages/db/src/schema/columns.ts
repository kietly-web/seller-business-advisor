import { bigint, numeric, pgSchema, timestamp, uuid } from 'drizzle-orm/pg-core';

export const app = pgSchema('app');

export const id = () => uuid('id').primaryKey().defaultRandom();
export const vnd = (name: string) => bigint(name, { mode: 'bigint' });
export const fraction = (name: string) => numeric(name, { precision: 7, scale: 4 });
export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const tstz = (name: string) => timestamp(name, { withTimezone: true });
