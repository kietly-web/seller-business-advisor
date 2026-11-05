import type { PGlite } from '@electric-sql/pglite';
import { createShop, listUploads, withShopContext, withUserContext, type Db } from '@sa/db';
import { createTestDb } from '@sa/db/testing';
import { createOrderHasher, detect, prepare, REGISTRY, toWire, transform } from '@sa/parsers';
import { generateShop, ordersExport } from '@sa/parsers/synthetic';
import { asIsoDate, asUserId, type ShopId } from '@sa/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCostForm } from './costs';
import { seedDemoShop } from './demo-seed';
import { cancelUpload, finishUpload, sendChunk, startUpload } from './ingest';

const TODAY = asIsoDate('2026-11-05');
let client: PGlite;
let db: Db;

beforeAll(async () => {
  ({ client, db } = await createTestDb());
});

afterAll(async () => {
  await client.close();
});

async function queryAs<T>(who: { userId: string; shopId: ShopId }, query: string): Promise<T[]> {
  return client.transaction(async (t) => {
    await t.query('set local role sa_app');
    await t.query("select set_config('app.shop_id', $1, true), set_config('app.user_id', $2, true)", [who.shopId, who.userId]);
    return (await t.query<T>(query)).rows;
  });
}

async function newShop(userId: string): Promise<{ userId: string; shopId: ShopId }> {
  const shopId = await withUserContext(db, asUserId(userId), (tx) => createShop(tx, { name: userId, category: null, isDemo: false }));
  return { userId, shopId };
}

const start = (overrides: Record<string, unknown> = {}) => ({
  parserId: 'shopee.orders@v1',
  fileSha256: 'f'.repeat(64),
  fileName: 'C:\\Users\\lan\\don-hang.csv',
  removedColumns: [{ name: 'Số điện thoại', pii: true }],
  ...overrides,
});

describe('ingest service', () => {
  it('runs a parsed export end to end and strips the client path from the file name', async () => {
    const who = await newShop('svc-1');
    const table = ordersExport(generateShop({ days: 10, products: 3 }));
    const d = detect(REGISTRY, table);
    if (d.kind !== 'match') throw new Error(d.kind);
    const started = await startUpload(db, who, start());
    if (!started.ok) throw new Error(started.error);
    const { records } = await transform(prepare(d.candidate, table), table, {
      hashOrderId: createOrderHasher(Buffer.from(started.salt, 'base64')),
      today: TODAY,
    });
    expect((await sendChunk(db, who, started.uploadId, records.map(toWire))).ok).toBe(true);
    const done = await finishUpload(db, who, started.uploadId, { expectedRecords: records.length, issues: [] });
    expect(done).toMatchObject({ ok: true, rowCount: records.length });
    const [upload] = await withShopContext(db, { role: 'sa_app', shopId: who.shopId, userId: asUserId(who.userId) }, (tx) =>
      listUploads(tx, who.shopId),
    );
    expect(upload?.fileName).toBe('don-hang.csv');
    const named = await startUpload(db, who, start({ fileSha256: 'e'.repeat(64), fileName: 'don-0912345678.xlsx' }));
    expect(named.ok).toBe(true);
    const [latest] = await withShopContext(db, { role: 'sa_app', shopId: who.shopId, userId: asUserId(who.userId) }, (tx) =>
      listUploads(tx, who.shopId),
    );
    expect(latest?.fileName).toBe('file.xlsx');
  });

  it('rejects malformed input, unknown parsers and PII-looking header names', async () => {
    const who = await newShop('svc-2');
    expect(await startUpload(db, who, start({ parserId: 'shopee.secret@v9' }))).toEqual({ ok: false, error: 'invalid' });
    expect(await startUpload(db, who, start({ extra: 1 }))).toEqual({ ok: false, error: 'invalid' });
    expect(await startUpload(db, who, start({ removedColumns: [{ name: '0900000000', pii: false }] }))).toEqual({
      ok: false,
      error: 'pii_suspected',
    });
    expect(await sendChunk(db, who, 'not-a-uuid', [])).toEqual({ ok: false, error: 'invalid' });
  });

  it('aborts the upload and audits it when a chunk carries an email address', async () => {
    const who = await newShop('svc-3');
    const started = await startUpload(db, who, start({ parserId: 'seller.stock@v1' }));
    if (!started.ok) throw new Error(started.error);
    const bad = { kind: 'stock', sourceRow: 2, skuKey: 'sku:nguoimua@example.com', asOf: '2026-11-01', onHand: 1, leadTimeDays: null };
    expect(await sendChunk(db, who, started.uploadId, [bad])).toEqual({ ok: false, error: 'pii_suspected' });
    expect(await sendChunk(db, who, started.uploadId, [{ ...bad, skuKey: 'sku:A' }])).toEqual({ ok: false, error: 'state' });
    const audit = await queryAs(who, "select action from app.audit_log where action = 'upload.rejected_pii'");
    expect(audit).toHaveLength(1);
    await cancelUpload(db, who, started.uploadId);
  });

  it('seeds a full demo shop through the same path', async () => {
    const who = await newShop('svc-demo');
    await seedDemoShop(db, who, TODAY);
    const counts = await queryAs<{ uploads: number; skus: number; lines: number; fees: number; costs: number; stock: number }>(
      who,
      `select
          (select count(*)::int from app.upload where status = 'parsed') as uploads,
          (select count(*)::int from app.sku) as skus,
          (select count(*)::int from app.order_line) as lines,
          (select count(*)::int from app.fee_line) as fees,
          (select count(*)::int from app.unit_cost) as costs,
          (select count(*)::int from app.stock_snapshot) as stock`,
    );
    expect(counts[0]).toMatchObject({ uploads: 4, skus: 180, stock: 180 });
    expect(counts[0]?.lines).toBeGreaterThan(5000);
    expect(counts[0]?.fees).toBeGreaterThan(5000);
    expect(counts[0]?.costs).toBeGreaterThan(140);
  }, 120_000);
});

describe('recompute failure', () => {
  it('reports a committed upload as done and queues the recompute', async () => {
    const who = await newShop('svc-recompute');
    const started = await startUpload(db, who, start({ parserId: 'seller.stock@v1', fileSha256: 'd'.repeat(64) }));
    if (!started.ok) throw new Error(started.error);
    await client.exec('alter table app.sku_week_metric rename to sku_week_metric_off');
    try {
      const done = await finishUpload(db, who, started.uploadId, { expectedRecords: 0, issues: [] });
      expect(done.ok).toBe(true);
    } finally {
      await client.exec('alter table app.sku_week_metric_off rename to sku_week_metric');
    }
    const jobs = await client.transaction(async (t) => {
      await t.query('set local role sa_worker');
      return (await t.query("select kind from app.job where kind = 'metrics.recompute' and shop_id = $1", [who.shopId])).rows;
    });
    expect(jobs).toHaveLength(1);
  });
});

describe('parseCostForm', () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  const skuId = '00000000-0000-0000-0001-000000000003';

  it('accepts Vietnamese money input and defaults packaging to zero', () => {
    expect(parseCostForm(form({ skuId, cogs: '85.000', packaging: '' }))).toEqual({ skuId, cogsVnd: 85_000n, packagingVnd: 0n });
  });

  it.each<Record<string, string>>([{ cogs: '' }, { cogs: '-1' }, { cogs: 'abc' }, { cogs: '2000000000' }, { cogs: '1', packaging: 'x' }])('rejects %o', (fields) => {
    expect(parseCostForm(form({ skuId, ...fields }))).toBeNull();
  });
});
