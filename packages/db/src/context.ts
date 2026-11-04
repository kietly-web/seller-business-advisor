import { sql, type ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type { ShopId, UserId } from '@sa/shared';
import type * as schema from './schema';

type Schema = typeof schema;

export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type DbRole = 'sa_app' | 'sa_worker';
const ROLES: readonly DbRole[] = ['sa_app', 'sa_worker'];

export interface DbContext {
  role: DbRole;
  userId?: UserId;
  shopId?: ShopId;
}

export async function withContext<T>(db: Db, ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!ROLES.includes(ctx.role)) {
    throw new TypeError('Unknown database role');
  }
  return db.transaction(async (tx) => {
    // Role and settings are transaction-local, so a pooled connection never carries them into another request
    await tx.execute(sql.raw(`set local role ${ctx.role}`));
    await tx.execute(
      sql`select set_config('app.shop_id', ${ctx.shopId ?? ''}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`,
    );
    return fn(tx);
  });
}

export function withShopContext<T>(
  db: Db,
  ctx: { role: DbRole; shopId: ShopId; userId?: UserId },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withContext(db, ctx, fn);
}

export function withUserContext<T>(db: Db, userId: UserId, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withContext(db, { role: 'sa_app', userId }, fn);
}
