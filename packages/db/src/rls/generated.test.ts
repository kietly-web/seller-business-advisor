import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../testing/pglite';
import { fixtureIds, tenantFixtureSql, USERS } from '../testing/tenant-fixture';

const A = fixtureIds('a').shop;
const B = fixtureIds('b').shop;

type Ctx = { role: 'sa_app' | 'sa_worker'; shopId?: string; userId?: string };

let client: PGlite;
let tables: { table: string; key: string }[] = [];

async function asRole<T>(ctx: Ctx, sql: string): Promise<T[]> {
  return client.transaction(async (tx) => {
    await tx.exec(`set local role ${ctx.role}`);
    await tx.query(`select set_config('app.shop_id', $1, true), set_config('app.user_id', $2, true)`, [
      ctx.shopId ?? '',
      ctx.userId ?? '',
    ]);
    return (await tx.query<T>(sql)).rows;
  });
}

async function visibleShops(ctx: Ctx, table: string, key: string): Promise<string[] | 'denied'> {
  try {
    const rows = await asRole<{ shop: string | null }>(ctx, `select distinct ${key}::text as shop from app.${table}`);
    return rows.map((r) => r.shop ?? 'null').sort();
  } catch (error) {
    if ((error as Error).message.includes('permission denied')) {
      return 'denied';
    }
    throw error;
  }
}

const memberA: Ctx = { role: 'sa_app', shopId: A, userId: USERS.a };

beforeAll(async () => {
  ({ client } = await createTestDb());
  await client.exec(tenantFixtureSql('a') + tenantFixtureSql('b'));
  const { rows } = await client.query<{ table_name: string }>(
    `select table_name from information_schema.columns
     where table_schema = 'app' and column_name = 'shop_id' order by table_name`,
  );
  tables = [{ table: 'shop', key: 'id' }, ...rows.map((r) => ({ table: r.table_name, key: 'shop_id' }))];
});

afterAll(async () => {
  await client.close();
});

describe('generated RLS suite', () => {
  it('has fixture rows for both shops in every tenant table', async () => {
    expect(tables.length).toBeGreaterThan(15);
    for (const { table, key } of tables) {
      const { rows } = await client.query<{ shop: string }>(`select distinct ${key}::text as shop from app.${table}`);
      expect({ table, shops: rows.map((r) => r.shop).sort() }).toEqual({ table, shops: [A, B].sort() });
    }
  });

  it('shows a member only their context shop', async () => {
    for (const { table, key } of tables) {
      const seen = await visibleShops(memberA, table, key);
      expect({ table, ok: seen === 'denied' || (seen.length > 0 && seen.every((s) => s === A)) }).toEqual({
        table,
        ok: true,
      });
    }
  });

  it('shows nothing when membership is spoofed', async () => {
    const spoofed: Ctx = { role: 'sa_app', shopId: A, userId: USERS.b };
    for (const { table, key } of tables) {
      const seen = await visibleShops(spoofed, table, key);
      if (table === 'shop' || table === 'shop_member') {
        expect({ table, seen }).toEqual({ table, seen: [B] });
        continue;
      }
      expect({ table, ok: seen === 'denied' || seen.length === 0 }).toEqual({ table, ok: true });
    }
  });

  it('shows nothing without a context', async () => {
    for (const { table, key } of tables) {
      const seen = await visibleShops({ role: 'sa_app' }, table, key);
      expect({ table, ok: seen === 'denied' || seen.length === 0 }).toEqual({ table, ok: true });
    }
  });

  it('refuses to move a row into another shop', async () => {
    for (const { table, key } of tables) {
      let moved = false;
      try {
        const rows = await asRole<{ n: number }>(
          memberA,
          `with u as (update app.${table} set ${key} = '${B}' where ${key} = '${A}' returning 1) select count(*)::int as n from u`,
        );
        moved = (rows[0]?.n ?? 0) > 0;
      } catch {
        moved = false;
      }
      expect({ table, moved }).toEqual({ table, moved: false });
    }
    const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from app.sku where shop_id = $1`, [B]);
    expect(rows[0]?.n).toBe(1);
  });

  it('scopes the worker to its job shop', async () => {
    const worker: Ctx = { role: 'sa_worker', shopId: B };
    const crossTenant = ['job', 'data_request'];
    for (const { table, key } of tables) {
      const seen = await visibleShops(worker, table, key);
      if (crossTenant.includes(table)) {
        continue;
      }
      expect({ table, ok: seen === 'denied' || seen.every((s) => s === B || s === 'null') }).toEqual({ table, ok: true });
    }
  });
});
