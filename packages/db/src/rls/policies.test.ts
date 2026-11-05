import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../testing/pglite';

const SHOP_A = '00000000-0000-0000-0000-00000000000a';
const SHOP_B = '00000000-0000-0000-0000-00000000000b';
const USER_A = 'user-a';
const USER_B = 'user-b';

type Ctx = { role: 'sa_app' | 'sa_worker'; shopId?: string; userId?: string };

let client: PGlite;

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

async function fails(ctx: Ctx, sql: string): Promise<string | null> {
  try {
    await asRole(ctx, sql);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

const appA: Ctx = { role: 'sa_app', shopId: SHOP_A, userId: USER_A };

beforeAll(async () => {
  ({ client } = await createTestDb());
  await client.exec(`
    insert into app.shop (id, name, order_hash_salt) values ('${SHOP_A}', 'A', '\\x00000000000000000000000000000000'), ('${SHOP_B}', 'B', '\\x00000000000000000000000000000000');
    insert into app.shop_member (shop_id, user_id, role) values ('${SHOP_A}', '${USER_A}', 'owner'), ('${SHOP_B}', '${USER_B}', 'owner');
    insert into app.sku (shop_id, name) values ('${SHOP_A}', 'sku A'), ('${SHOP_B}', 'sku B');
    insert into app.consent_record (user_id, purpose, granted, policy_version, ui_text_hash)
      values ('${USER_A}', 'service_processing', true, 'v1', 'h'), ('${USER_B}', 'service_processing', true, 'v1', 'h');
  `);
});

afterAll(async () => {
  await client.close();
});

describe('tenant isolation for sa_app', () => {
  it('shows only the context shop to its member', async () => {
    expect(await asRole<{ name: string }>(appA, 'select name from app.sku')).toEqual([{ name: 'sku A' }]);
  });

  it('shows nothing when the user is not a member of the context shop', async () => {
    const spoofed: Ctx = { role: 'sa_app', shopId: SHOP_A, userId: USER_B };
    expect(await asRole(spoofed, 'select * from app.sku')).toEqual([]);
  });

  it('shows nothing without a context', async () => {
    expect(await asRole({ role: 'sa_app' }, 'select * from app.sku')).toEqual([]);
  });

  it('rejects writing a row for another shop', async () => {
    const error = await fails(appA, `insert into app.sku (shop_id, name) values ('${SHOP_B}', 'x')`);
    expect(error).toMatch(/row-level security/);
  });

  it('cannot move its own row to another shop', async () => {
    const error = await fails(appA, `update app.sku set shop_id = '${SHOP_B}'`);
    expect(error).toMatch(/row-level security/);
  });
});

describe('shops and memberships', () => {
  it('lists only the shops the user belongs to, without a shop context', async () => {
    const rows = await asRole<{ id: string }>({ role: 'sa_app', userId: USER_A }, 'select id from app.shop');
    expect(rows.map((r) => r.id)).toEqual([SHOP_A]);
  });

  it('creates a shop with the caller as owner through create_shop', async () => {
    const user = 'user-new';
    const [created] = await asRole<{ id: string }>(
      { role: 'sa_app', userId: user },
      `select app_ctx.create_shop('New shop', 'home', false) as id`,
    );
    const members = await client.query(`select user_id, role from app.shop_member where shop_id = $1`, [created?.id]);
    expect(members.rows).toEqual([{ user_id: user, role: 'owner' }]);
  });

  it('refuses create_shop without a user context', async () => {
    const error = await fails({ role: 'sa_app' }, `select app_ctx.create_shop('x', null, false)`);
    expect(error).toMatch(/app.user_id is not set/);
  });

  it('cannot insert shops or memberships directly', async () => {
    expect(await fails(appA, `insert into app.shop (name, order_hash_salt) values ('x', '\\x00000000000000000000000000000000')`)).toMatch(
      /permission denied/,
    );
    expect(
      await fails(appA, `insert into app.shop_member (shop_id, user_id, role) values ('${SHOP_B}', '${USER_A}', 'staff')`),
    ).toMatch(/permission denied/);
  });
});

describe('append-only and user-scoped tables', () => {
  it('shows only the caller’s consent records and forbids changing them', async () => {
    const rows = await asRole<{ user_id: string }>({ role: 'sa_app', userId: USER_A }, 'select user_id from app.consent_record');
    expect(rows).toEqual([{ user_id: USER_A }]);
    expect(await fails({ role: 'sa_app', userId: USER_A }, `update app.consent_record set granted = false`)).toMatch(
      /permission denied/,
    );
  });

  it('lets the app write the audit log but never change it', async () => {
    await asRole(appA, `insert into app.audit_log (shop_id, actor, action, entity) values ('${SHOP_A}', '${USER_A}', 'test', 'sku')`);
    expect(await fails(appA, `delete from app.audit_log`)).toMatch(/permission denied/);
    expect(await fails(appA, `update app.audit_log set action = 'x'`)).toMatch(/permission denied/);
  });
});

describe('jobs and the worker role', () => {
  it('lets the app enqueue jobs only for its own shop and not read the queue', async () => {
    await asRole(appA, `insert into app.job (kind, shop_id) values ('recompute_metrics', '${SHOP_A}')`);
    expect(await fails(appA, `insert into app.job (kind, shop_id) values ('recompute_metrics', '${SHOP_B}')`)).toMatch(
      /row-level security/,
    );
    expect(await fails(appA, `select * from app.job`)).toMatch(/permission denied/);
  });

  it('scopes the worker to the shop of the job it runs', async () => {
    const rows = await asRole<{ name: string }>({ role: 'sa_worker', shopId: SHOP_B }, 'select name from app.sku');
    expect(rows).toEqual([{ name: 'sku B' }]);
  });

  it('gives only the worker the cross-tenant list of shop ids', async () => {
    const rows = await asRole<{ id: string }>({ role: 'sa_worker' }, 'select app_ctx.active_shop_ids() as id');
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([SHOP_A, SHOP_B]));
    expect(await fails(appA, 'select app_ctx.active_shop_ids()')).toMatch(/permission denied/);
  });
});

describe('cross-shop references and forged rows', () => {
  it('rejects a row in shop A that points at shop B’s SKU', async () => {
    const { rows } = await client.query<{ id: string }>(`select id from app.sku where shop_id = $1`, [SHOP_B]);
    const error = await fails(
      appA,
      `insert into app.unit_cost (shop_id, sku_id, cogs_vnd, effective_from, source, created_by)
       values ('${SHOP_A}', '${rows[0]?.id}', 1000, '2026-11-01', 'inline', '${USER_A}')`,
    );
    expect(error).toMatch(/foreign key/);
  });

  it('keeps job dedupe keys per shop, so one shop cannot block another', async () => {
    const key = `recompute:${SHOP_B}`;
    await asRole(appA, `insert into app.job (kind, shop_id, dedupe_key) values ('recompute_metrics', '${SHOP_A}', '${key}')`);
    const appB: Ctx = { role: 'sa_app', shopId: SHOP_B, userId: USER_B };
    expect(
      await fails(appB, `insert into app.job (kind, shop_id, dedupe_key) values ('recompute_metrics', '${SHOP_B}', '${key}')`),
    ).toBeNull();
  });

  it('rejects audit rows written in someone else’s name', async () => {
    const error = await fails(
      { role: 'sa_app', userId: USER_A },
      `insert into app.audit_log (actor, action, entity) values ('someone-else', 'consent.granted', 'consent_record')`,
    );
    expect(error).toMatch(/row-level security/);
  });

  it('sets DSR timers and status in the database, ignoring the client', async () => {
    const user = { role: 'sa_app' as const, userId: USER_A };
    expect(
      await fails(user, `insert into app.data_request (user_id, kind, status) values ('${USER_A}', 'delete', 'completed')`),
    ).toMatch(/permission denied/);
    const [row] = await asRole<{ status: string; days: number; ack_ok: boolean }>(
      user,
      `insert into app.data_request (user_id, kind) values ('${USER_A}', 'delete')
       returning status, round(extract(epoch from due_at - received_at) / 86400)::int as days,
                 ack_due_at > received_at as ack_ok`,
    );
    expect(row).toEqual({ status: 'open', days: 20, ack_ok: true });
  });

  it('lets members rename a shop but never change its salt or demo flag', async () => {
    await asRole(appA, `update app.shop set name = 'A renamed' where id = '${SHOP_A}'`);
    expect(await fails(appA, `update app.shop set order_hash_salt = '' where id = '${SHOP_A}'`)).toMatch(/permission denied/);
    expect(await fails(appA, `update app.shop set is_demo = true where id = '${SHOP_A}'`)).toMatch(/permission denied/);
  });

  it('generates a 32-byte salt in create_shop', async () => {
    const [created] = await asRole<{ id: string }>(
      { role: 'sa_app', userId: 'user-salt' },
      `select app_ctx.create_shop('Salted', null, false) as id`,
    );
    const { rows } = await client.query<{ n: number }>(`select octet_length(order_hash_salt) as n from app.shop where id = $1`, [
      created?.id,
    ]);
    expect(rows[0]?.n).toBe(32);
  });

  it('does not let the worker add shop members', async () => {
    const error = await fails(
      { role: 'sa_worker', shopId: SHOP_A },
      `insert into app.shop_member (shop_id, user_id, role) values ('${SHOP_A}', 'intruder', 'owner')`,
    );
    expect(error).toMatch(/permission denied/);
  });
});

describe('policy coverage (catalog check)', () => {
  const NOT_FORCED = ['shop', 'shop_member'];

  it('enables RLS on every app table and forces it except where SECURITY DEFINER reads', async () => {
    const { rows } = await client.query<{ relname: string; rls: boolean; forced: boolean }>(
      `select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'app' and c.relkind = 'r'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect({ table: r.relname, rls: r.rls }).toEqual({ table: r.relname, rls: true });
      expect({ table: r.relname, forced: r.forced }).toEqual({ table: r.relname, forced: !NOT_FORCED.includes(r.relname) });
    }
  });

  it('gives every table with shop_id a policy for both sa_app and sa_worker', async () => {
    const { rows } = await client.query<{ table_name: string; roles: string[] }>(
      `select c.table_name,
              array(select distinct r.rolname::text from pg_policy p
                    join pg_class pc on pc.oid = p.polrelid
                    join pg_namespace pn on pn.oid = pc.relnamespace
                    cross join lateral unnest(p.polroles) as role_oid
                    join pg_roles r on r.oid = role_oid
                    where pn.nspname = 'app' and pc.relname = c.table_name
                    order by 1) as roles
       from information_schema.columns c
       where c.table_schema = 'app' and c.column_name = 'shop_id'`,
    );
    for (const r of rows) {
      expect({ table: r.table_name, roles: r.roles }).toEqual({ table: r.table_name, roles: ['sa_app', 'sa_worker'] });
    }
  });
});

describe('auth schema isolation', () => {
  it.each(['user', 'session', 'account', 'verification', 'two_factor', 'rate_limit'])(
    'keeps auth.%s out of reach of the tenant roles',
    async (table) => {
      expect(await fails(appA, `select * from auth."${table}"`)).toMatch(/permission denied/);
      expect(await fails({ role: 'sa_worker', shopId: SHOP_A }, `select * from auth."${table}"`)).toMatch(
        /permission denied/,
      );
    },
  );

  it('grants sa_auth access to every auth table', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables t
       where table_schema = 'auth'
         and not has_table_privilege('sa_auth', format('%I.%I', table_schema, table_name), 'select, insert, update, delete')`,
    );
    expect(rows).toEqual([]);
  });
});
