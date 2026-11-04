import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../testing/pglite';

const EXPECTED_TABLES = [
  'audit_log',
  'competitor_listing',
  'competitor_observation',
  'consent_record',
  'data_request',
  'fee_line',
  'ingest_stage',
  'job',
  'llm_call',
  'order_line',
  'outcome',
  'product_traffic',
  'recommendation',
  'recommendation_run',
  'rule_track_record',
  'shop',
  'shop_member',
  'sku',
  'sku_week_metric',
  'stock_snapshot',
  'unit_cost',
  'upload',
];

const TABLES_WITHOUT_SHOP_ID = ['consent_record', 'data_request', 'shop'];
const HASH = 'a'.repeat(64);

let client: PGlite;

async function rejects(sql: string): Promise<boolean> {
  try {
    await client.exec(`begin; ${sql}`);
    return false;
  } catch {
    return true;
  } finally {
    await client.exec('rollback');
  }
}

beforeAll(async () => {
  ({ client } = await createTestDb());
  await client.exec(`
    insert into app.shop (id, name, order_hash_salt) values ('00000000-0000-0000-0000-00000000000a', 'A', '\\x00');
    insert into app.upload (id, shop_id, uploaded_by, export_type, parser_id, file_sha256, file_name, removed_columns, status)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'u', 'shopee.orders', 'shopee.orders@v1', 'f', 'f.xlsx', '[]', 'parsed');
    insert into app.sku (id, shop_id, name) values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'Kệ gia vị 3 tầng');
  `);
});

afterAll(async () => {
  await client.close();
});

describe('migration 0000_init', () => {
  it('creates exactly the tables in docs/design/02-data-model.md', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'app' order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(EXPECTED_TABLES);
  });

  it('gives every tenant table a shop_id column', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.columns where table_schema = 'app' and column_name = 'shop_id'`,
    );
    const withShopId = rows.map((r) => r.table_name).sort();
    expect(withShopId).toEqual(EXPECTED_TABLES.filter((t) => !TABLES_WITHOUT_SHOP_ID.includes(t)));
  });

  it('stores money as bigint', async () => {
    const { rows } = await client.query<{ data_type: string }>(
      `select distinct data_type from information_schema.columns where table_schema = 'app' and column_name like '%\\_vnd' escape '\\'`,
    );
    expect(rows.map((r) => r.data_type)).toEqual(['bigint']);
  });

  it('rejects an order line whose order id is not a SHA-256 hash', async () => {
    const insert = (hash: string) => `
      insert into app.order_line (shop_id, upload_id, source_row, order_hash, order_status, ordered_at, sku_id, quantity, unit_list_price_vnd, gross_revenue_vnd)
      values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 1, '${hash}', 'completed', now(), '00000000-0000-0000-0000-0000000000a2', 1, 189000, 189000);`;
    expect(await rejects(insert('251104ABCDEF12'))).toBe(true);
    expect(await rejects(insert(HASH))).toBe(false);
  });

  it('only accepts Shopee competitor URLs', async () => {
    const insert = (url: string) => `
      insert into app.competitor_listing (shop_id, sku_id, url)
      values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', '${url}');`;
    expect(await rejects(insert('https://example.com/x'))).toBe(true);
    expect(await rejects(insert('https://shopeexvn.com/x'))).toBe(true);
    expect(await rejects(insert('https://shopee.vn/ke-gia-vi-i.1.2'))).toBe(false);
  });

  it('treats a null shop_id as one global row per rule in rule_track_record', async () => {
    expect(
      await rejects(`
        insert into app.rule_track_record (rule_code) values ('NEGATIVE_MARGIN');
        insert into app.rule_track_record (rule_code) values ('NEGATIVE_MARGIN');`),
    ).toBe(true);
  });

  it('cascades a shop delete to its data', async () => {
    await client.exec(`
      begin;
      delete from app.shop where id = '00000000-0000-0000-0000-00000000000a';
    `);
    const { rows } = await client.query<{ n: number }>(`select count(*)::int as n from app.sku`);
    await client.exec('rollback');
    expect(rows[0]?.n).toBe(0);
  });
});
