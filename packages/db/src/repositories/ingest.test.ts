import { asUserId, type ShopId } from '@sa/shared';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { withShopContext, withUserContext, type Db } from '../context';
import { createTestDb } from '../testing/pglite';
import {
  abortUpload,
  completeUpload,
  createUpload,
  DuplicateUploadError,
  listUploads,
  stageRecords,
  UploadStateError,
  type StagedRecord,
} from './ingest';
import { rowsOf } from './rows';
import { createShop } from './shops';

const USER = 'ingest-owner';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

let db: Db;
let shopId: ShopId;

const inShop = <T>(fn: Parameters<typeof withShopContext<T>>[2]) => withShopContext(db, { role: 'sa_app', shopId, userId: asUserId(USER) }, fn);

function line(sourceRow: number, orderHash: string, skuKey: string, gross: number, extra: Partial<StagedRecord> = {}): StagedRecord {
  return {
    kind: 'order_line',
    sourceRow,
    orderHash,
    orderStatus: 'completed',
    orderedAt: '2026-10-01T02:30:00.000Z',
    completedAt: null,
    skuKey,
    itemName: `Item ${skuKey}`,
    variation: null,
    sellerSku: null,
    quantity: 1,
    unitListPriceVnd: String(gross),
    grossRevenueVnd: String(gross),
    sellerDiscountVnd: '0',
    platformDiscountVnd: '0',
    ...extra,
  };
}

function fee(sourceRow: number, orderHash: string, feeType: string, amount: number, incurredOn = '2026-10-05'): StagedRecord {
  return { kind: 'fee_line', sourceRow, orderHash, feeType, amountVnd: String(amount), incurredOn };
}

async function ingest(exportType: string, sha: string, records: StagedRecord[]) {
  return inShop(async (tx) => {
    const { uploadId } = await createUpload(tx, {
      shopId,
      userId: USER,
      exportType,
      parserId: `${exportType}@v1`,
      fileSha256: sha,
      fileName: `${sha}.csv`,
      removedColumns: [{ name: 'Số điện thoại', pii: true }],
    });
    await stageRecords(tx, shopId, uploadId, records);
    return { uploadId, result: await completeUpload(tx, { shopId, uploadId, userId: USER, expectedRecords: records.length, warnings: [] }) };
  });
}

const count = (table: string) =>
  inShop(async (tx) => rowsOf<{ n: number }>(await tx.execute(sql.raw(`select count(*)::int as n from app.${table}`)))[0]?.n);

beforeEach(async () => {
  ({ db } = await createTestDb());
  shopId = await withUserContext(db, asUserId(USER), (tx) => createShop(tx, { name: 'Shop', category: null, isDemo: false }));
});

describe('ingest', () => {
  it('returns the shop salt and merges order lines into SKUs and facts', async () => {
    const salt = await inShop(async (tx) => {
      const created = await createUpload(tx, {
        shopId, userId: USER, exportType: 'shopee.orders', parserId: 'shopee.orders@v1', fileSha256: 's0', fileName: 'a.csv', removedColumns: [],
      });
      return created.salt;
    });
    expect(salt.length).toBe(32);

    const { result } = await ingest('shopee.orders', 's1', [
      line(2, HASH_A, 'sku:A', 100_000),
      line(3, HASH_A, 'sku:A', 50_000),
      line(4, HASH_B, 'sku:B', 70_000),
    ]);
    expect(result).toMatchObject({ rowCount: 3, periodFrom: '2026-10-01', periodTo: '2026-10-01', superseded: 0 });
    expect(await count('sku')).toBe(2);
    expect(await count('order_line')).toBe(2);
    const [merged] = await inShop(async (tx) =>
      rowsOf<{ gross: string; quantity: number }>(
        await tx.execute(sql`select gross_revenue_vnd::text as gross, quantity from app.order_line where order_hash = ${HASH_A}`),
      ),
    );
    expect(merged).toEqual({ gross: '150000', quantity: 2 });
    expect(await count('ingest_stage')).toBe(0);
  });

  it('keeps every fee of an income row and replaces an order’s fees on re-import', async () => {
    await ingest('shopee.income', 'i1', [fee(2, HASH_A, 'commission', 4000), fee(2, HASH_A, 'service', 3000), fee(3, HASH_B, 'service', 1000)]);
    expect(await count('fee_line')).toBe(3);
    await ingest('shopee.income', 'i2', [fee(5, HASH_A, 'commission', 5000, '2026-10-20')]);
    expect(await count('fee_line')).toBe(2);
  });

  it('supersedes an older upload covering the same period', async () => {
    await ingest('shopee.orders', 'o1', [line(2, HASH_A, 'sku:A', 1000), line(3, HASH_B, 'sku:A', 1000)]);
    const { result } = await ingest('shopee.orders', 'o2', [line(2, HASH_A, 'sku:A', 2000)]);
    expect(result.superseded).toBe(1);
    expect(await count('order_line')).toBe(1);
    const statuses = await inShop((tx) => listUploads(tx, shopId));
    expect(statuses.map((u) => u.status)).toEqual(['parsed', 'superseded']);
    expect(statuses[0]?.removedPiiColumns).toBe(1);
  });

  it('writes unit costs and stock for known SKUs and counts unknown keys', async () => {
    await ingest('shopee.orders', 'o1', [line(2, HASH_A, 'sku:A', 1000)]);
    const { result } = await ingest('seller.unit_costs', 'c1', [
      { kind: 'unit_cost', sourceRow: 3, skuKey: 'sku:A', cogsVnd: '400', packagingVnd: '50', effectiveFrom: '2026-10-01' },
      { kind: 'unit_cost', sourceRow: 4, skuKey: 'sku:Z', cogsVnd: '1', packagingVnd: '0', effectiveFrom: '2026-10-01' },
    ]);
    expect(result.unknownSkuRows).toBe(1);
    expect(await count('unit_cost')).toBe(1);
    await ingest('seller.stock', 'k1', [{ kind: 'stock', sourceRow: 3, skuKey: 'sku:A', asOf: '2026-10-02', onHand: 9, leadTimeDays: null }]);
    expect(await count('stock_snapshot')).toBe(1);
  });

  it('rejects a duplicate file, an incomplete upload and chunks after abort', async () => {
    await ingest('shopee.orders', 'dup', [line(2, HASH_A, 'sku:A', 1000)]);
    await expect(ingest('shopee.orders', 'dup', [line(2, HASH_A, 'sku:A', 1000)])).rejects.toBeInstanceOf(DuplicateUploadError);

    await inShop(async (tx) => {
      const { uploadId } = await createUpload(tx, {
        shopId, userId: USER, exportType: 'shopee.orders', parserId: 'shopee.orders@v1', fileSha256: 'x', fileName: 'x.csv', removedColumns: [],
      });
      await stageRecords(tx, shopId, uploadId, [line(2, HASH_A, 'sku:A', 1000)]);
      await stageRecords(tx, shopId, uploadId, [line(2, HASH_A, 'sku:A', 1000)]);
      await expect(
        completeUpload(tx, { shopId, uploadId, userId: USER, expectedRecords: 2, warnings: [] }),
      ).rejects.toBeInstanceOf(UploadStateError);
      await expect(stageRecords(tx, shopId, uploadId, [fee(9, HASH_A, 'service', 1)])).rejects.toMatchObject({ reason: 'wrong_kind' });
      await abortUpload(tx, shopId, uploadId);
      await expect(stageRecords(tx, shopId, uploadId, [line(3, HASH_A, 'sku:A', 1)])).rejects.toBeInstanceOf(UploadStateError);
    });
  });

  it('cannot touch another shop’s upload', async () => {
    const other = await withUserContext(db, asUserId('other-owner'), (tx) => createShop(tx, { name: 'B', category: null, isDemo: false }));
    const { uploadId } = await ingest('shopee.orders', 'mine', [line(2, HASH_A, 'sku:A', 1000)]);
    await expect(
      withShopContext(db, { role: 'sa_app', shopId: other, userId: asUserId('other-owner') }, (tx) =>
        stageRecords(tx, other, uploadId, [line(3, HASH_A, 'sku:A', 1)]),
      ),
    ).rejects.toBeInstanceOf(UploadStateError);
  });
});
