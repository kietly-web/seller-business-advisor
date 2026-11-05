import { asUploadId, type ShopId, type UploadId } from '@sa/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../context';
import { feeLine, ingestStage, orderLine, shop, upload } from '../schema';
import { appendAudit } from './audit';
import { rowsOf } from './rows';

export const MAX_STAGED_RECORDS = 200_000;

export type StagedRecordKind = 'order_line' | 'fee_line' | 'unit_cost' | 'stock';

const KIND_BY_EXPORT: Readonly<Record<string, StagedRecordKind>> = {
  'shopee.orders': 'order_line',
  'shopee.income': 'fee_line',
  'seller.unit_costs': 'unit_cost',
  'seller.stock': 'stock',
};

export interface StagedRecord {
  kind: StagedRecordKind;
  sourceRow: number;
  [field: string]: unknown;
}

export class DuplicateUploadError extends Error {
  constructor(readonly existingUploadId: UploadId) {
    super('This file was already uploaded');
  }
}

export class UploadStateError extends Error {
  constructor(readonly reason: 'not_receiving' | 'incomplete' | 'too_many_records' | 'wrong_kind' | 'unsupported_export') {
    super(`Upload cannot continue: ${reason}`);
  }
}

export interface NewUpload {
  shopId: ShopId;
  userId: string;
  exportType: string;
  parserId: string;
  fileSha256: string;
  fileName: string;
  removedColumns: { name: string; pii: boolean }[];
}

export async function createUpload(tx: Tx, input: NewUpload): Promise<{ uploadId: UploadId; salt: Uint8Array }> {
  if (!Object.hasOwn(KIND_BY_EXPORT, input.exportType)) {
    throw new UploadStateError('unsupported_export');
  }
  // One active upload per shop: a new one abandons any earlier unfinished upload
  const stale = await tx
    .update(upload)
    .set({ status: 'failed' })
    .where(and(eq(upload.shopId, input.shopId), eq(upload.status, 'receiving')))
    .returning({ id: upload.id });
  if (stale.length > 0) {
    await tx.delete(ingestStage).where(and(eq(ingestStage.shopId, input.shopId), inArray(ingestStage.uploadId, stale.map((s) => s.id))));
  }

  const [existing] = await tx
    .select({ id: upload.id, status: upload.status })
    .from(upload)
    .where(and(eq(upload.shopId, input.shopId), eq(upload.fileSha256, input.fileSha256)));
  if (existing && (existing.status === 'parsed' || existing.status === 'superseded')) {
    throw new DuplicateUploadError(asUploadId(existing.id));
  }
  if (existing) {
    await tx.delete(upload).where(and(eq(upload.shopId, input.shopId), eq(upload.id, existing.id)));
  }

  const [created] = await tx
    .insert(upload)
    .values({
      shopId: input.shopId,
      uploadedBy: input.userId,
      exportType: input.exportType,
      parserId: input.parserId,
      fileSha256: input.fileSha256,
      fileName: input.fileName,
      removedColumns: input.removedColumns,
      status: 'receiving',
    })
    .returning({ id: upload.id });
  const [owner] = await tx.select({ salt: shop.orderHashSalt }).from(shop).where(eq(shop.id, input.shopId));
  if (!created || !owner) {
    throw new Error('Upload could not be created');
  }
  await appendAudit(tx, {
    shopId: input.shopId,
    actor: input.userId,
    action: 'upload.created',
    entityId: created.id,
    meta: { parserId: input.parserId, removedPii: input.removedColumns.filter((c) => c.pii).length },
  });
  return { uploadId: asUploadId(created.id), salt: new Uint8Array(owner.salt) };
}

async function requireReceiving(tx: Tx, shopId: ShopId, uploadId: UploadId) {
  const [row] = await tx
    .select({ status: upload.status, exportType: upload.exportType })
    .from(upload)
    .where(and(eq(upload.shopId, shopId), eq(upload.id, uploadId)))
    .for('update');
  if (!row || row.status !== 'receiving') {
    throw new UploadStateError('not_receiving');
  }
  return row;
}

async function stagedCount(tx: Tx, shopId: ShopId, uploadId: UploadId): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(ingestStage)
    .where(and(eq(ingestStage.shopId, shopId), eq(ingestStage.uploadId, uploadId)));
  return row?.n ?? 0;
}

// Re-sent chunks are idempotent: the stage primary key includes the source row
export async function stageRecords(tx: Tx, shopId: ShopId, uploadId: UploadId, records: readonly StagedRecord[]): Promise<void> {
  const { exportType } = await requireReceiving(tx, shopId, uploadId);
  if (records.some((r) => r.kind !== KIND_BY_EXPORT[exportType])) {
    throw new UploadStateError('wrong_kind');
  }
  if ((await stagedCount(tx, shopId, uploadId)) + records.length > MAX_STAGED_RECORDS) {
    throw new UploadStateError('too_many_records');
  }
  if (records.length === 0) {
    return;
  }
  await tx
    .insert(ingestStage)
    .values(records.map((r) => ({ shopId, uploadId, recordKind: r.kind, sourceRow: r.sourceRow, seq: stageSeq(r), record: r })))
    .onConflictDoNothing();
}

const FEE_TYPES = ['commission', 'transaction', 'service', 'shipping_seller', 'affiliate', 'ads', 'other'];

// One income row yields a fee line per fee type, so the fee type keeps them apart, even across chunks
function stageSeq(record: StagedRecord): number {
  return record.kind === 'fee_line' ? Math.max(0, FEE_TYPES.indexOf(String(record.feeType))) : 0;
}

export async function abortUpload(tx: Tx, shopId: ShopId, uploadId: UploadId): Promise<void> {
  await tx
    .update(upload)
    .set({ status: 'failed' })
    .where(and(eq(upload.shopId, shopId), eq(upload.id, uploadId), eq(upload.status, 'receiving')));
  await tx.delete(ingestStage).where(and(eq(ingestStage.shopId, shopId), eq(ingestStage.uploadId, uploadId)));
}

export interface CompletedUpload {
  rowCount: number;
  periodFrom: string | null;
  periodTo: string | null;
  unknownSkuRows: number;
  superseded: number;
}

export async function completeUpload(
  tx: Tx,
  input: { shopId: ShopId; uploadId: UploadId; userId: string; expectedRecords: number; warnings: unknown[] },
): Promise<CompletedUpload> {
  const { shopId, uploadId } = input;
  const { exportType } = await requireReceiving(tx, shopId, uploadId);
  if ((await stagedCount(tx, shopId, uploadId)) !== input.expectedRecords) {
    throw new UploadStateError('incomplete');
  }
  const ofUpload = sql`st.shop_id = ${shopId} and st.upload_id = ${uploadId}`;
  const ofKind = (kind: StagedRecordKind) => sql`${ofUpload} and st.record_kind = ${kind}`;

  await tx.execute(sql`
    insert into app.sku (shop_id, sku_key, seller_sku, name, variation)
    select distinct on (st.record->>'skuKey') st.shop_id, st.record->>'skuKey', st.record->>'sellerSku', st.record->>'itemName', st.record->>'variation'
    from app.ingest_stage st
    where ${ofKind('order_line')}
    order by st.record->>'skuKey', st.source_row desc
    on conflict (shop_id, sku_key) do update
      set name = excluded.name, variation = excluded.variation, seller_sku = excluded.seller_sku`);

  // Lines for the same order and SKU are summed so the upsert never touches a row twice
  await tx.execute(sql`
    insert into app.order_line (shop_id, upload_id, source_row, order_hash, order_status, ordered_at, completed_at, sku_id,
      quantity, unit_list_price_vnd, gross_revenue_vnd, seller_discount_vnd, platform_discount_vnd)
    select st.shop_id, st.upload_id, min(st.source_row), st.record->>'orderHash',
      (array_agg(st.record->>'orderStatus' order by st.source_row desc))[1],
      min((st.record->>'orderedAt')::timestamptz), max((st.record->>'completedAt')::timestamptz), s.id,
      sum((st.record->>'quantity')::int), max((st.record->>'unitListPriceVnd')::bigint),
      sum((st.record->>'grossRevenueVnd')::bigint), sum((st.record->>'sellerDiscountVnd')::bigint),
      sum((st.record->>'platformDiscountVnd')::bigint)
    from app.ingest_stage st
    join app.sku s on s.shop_id = st.shop_id and s.sku_key = st.record->>'skuKey'
    where ${ofKind('order_line')}
    group by st.shop_id, st.upload_id, st.record->>'orderHash', s.id
    on conflict (shop_id, order_hash, sku_id) do update set
      upload_id = excluded.upload_id, source_row = excluded.source_row, order_status = excluded.order_status,
      ordered_at = excluded.ordered_at, completed_at = excluded.completed_at, quantity = excluded.quantity,
      unit_list_price_vnd = excluded.unit_list_price_vnd, gross_revenue_vnd = excluded.gross_revenue_vnd,
      seller_discount_vnd = excluded.seller_discount_vnd, platform_discount_vnd = excluded.platform_discount_vnd`);

  // An income export restates every fee of the orders it covers, so those orders' fees are replaced
  await tx.execute(sql`
    delete from app.fee_line f
    where f.shop_id = ${shopId}
      and f.order_hash in (select st.record->>'orderHash' from app.ingest_stage st
    where ${ofKind('fee_line')})`);
  await tx.execute(sql`
    insert into app.fee_line (shop_id, upload_id, source_row, order_hash, fee_type, amount_vnd, incurred_on)
    select st.shop_id, st.upload_id, st.source_row, st.record->>'orderHash', st.record->>'feeType',
      (st.record->>'amountVnd')::bigint, (st.record->>'incurredOn')::date
    from app.ingest_stage st
    where ${ofKind('fee_line')}`);

  await tx.execute(sql`
    insert into app.unit_cost (shop_id, sku_id, cogs_vnd, packaging_vnd, effective_from, source, created_by)
    select st.shop_id, s.id, (st.record->>'cogsVnd')::bigint, (st.record->>'packagingVnd')::bigint,
      (st.record->>'effectiveFrom')::date, 'template', ${input.userId}
    from app.ingest_stage st
    join app.sku s on s.shop_id = st.shop_id and s.sku_key = st.record->>'skuKey'
    where ${ofKind('unit_cost')}
    on conflict (shop_id, sku_id, effective_from) do update set
      cogs_vnd = excluded.cogs_vnd, packaging_vnd = excluded.packaging_vnd, source = excluded.source, created_by = excluded.created_by`);

  await tx.execute(sql`
    insert into app.stock_snapshot (shop_id, sku_id, as_of, on_hand, lead_time_days)
    select distinct on (s.id, (st.record->>'asOf')::date) st.shop_id, s.id, (st.record->>'asOf')::date,
      (st.record->>'onHand')::int, (st.record->>'leadTimeDays')::int
    from app.ingest_stage st
    join app.sku s on s.shop_id = st.shop_id and s.sku_key = st.record->>'skuKey'
    where ${ofKind('stock')}
    order by s.id, (st.record->>'asOf')::date, st.source_row desc
    on conflict (shop_id, sku_id, as_of) do update set on_hand = excluded.on_hand, lead_time_days = excluded.lead_time_days`);

  const [summary] = rowsOf<{ rows: number; period_from: string | null; period_to: string | null; unknown_sku: number }>(
    await tx.execute(sql`
      select count(distinct st.source_row)::int as rows,
        min(d.day)::text as period_from, max(d.day)::text as period_to,
        count(*) filter (where st.record_kind in ('unit_cost', 'stock')
          and not exists (select 1 from app.sku s where s.shop_id = st.shop_id and s.sku_key = st.record->>'skuKey'))::int as unknown_sku
      from app.ingest_stage st
      cross join lateral (select coalesce(
        (((st.record->>'orderedAt')::timestamptz at time zone 'UTC') + interval '7 hours')::date,
        (st.record->>'incurredOn')::date, (st.record->>'effectiveFrom')::date, (st.record->>'asOf')::date) as day) d
      where ${ofUpload}`),
  );

  let superseded = 0;
  if (summary?.period_from && summary.period_to && (exportType === 'shopee.orders' || exportType === 'shopee.income')) {
    const older = await tx
      .update(upload)
      .set({ status: 'superseded' })
      .where(
        and(
          eq(upload.shopId, shopId),
          eq(upload.exportType, exportType),
          eq(upload.status, 'parsed'),
          sql`${upload.periodFrom} >= ${summary.period_from}::date and ${upload.periodTo} <= ${summary.period_to}::date`,
        ),
      )
      .returning({ id: upload.id });
    superseded = older.length;
    if (older.length > 0) {
      const ids = older.map((o) => o.id);
      await tx.delete(orderLine).where(and(eq(orderLine.shopId, shopId), inArray(orderLine.uploadId, ids)));
      await tx.delete(feeLine).where(and(eq(feeLine.shopId, shopId), inArray(feeLine.uploadId, ids)));
    }
  }

  const unknownSkuRows = summary?.unknown_sku ?? 0;
  await tx.delete(ingestStage).where(and(eq(ingestStage.shopId, shopId), eq(ingestStage.uploadId, uploadId)));
  await tx
    .update(upload)
    .set({
      status: 'parsed',
      parsedAt: sql`now()`,
      rowCount: summary?.rows ?? 0,
      periodFrom: summary?.period_from ?? null,
      periodTo: summary?.period_to ?? null,
      warnings: unknownSkuRows > 0 ? [...input.warnings, { code: 'UNKNOWN_SKU', rows: unknownSkuRows }] : input.warnings,
    })
    .where(and(eq(upload.shopId, shopId), eq(upload.id, uploadId)));
  await appendAudit(tx, {
    shopId,
    actor: input.userId,
    action: 'upload.completed',
    entityId: uploadId,
    meta: { rows: summary?.rows ?? 0, superseded },
  });
  if (exportType === 'seller.unit_costs') {
    await appendAudit(tx, { shopId, actor: input.userId, action: 'cost.changed', entityId: uploadId, meta: { source: 'template' } });
  }
  return {
    rowCount: summary?.rows ?? 0,
    periodFrom: summary?.period_from ?? null,
    periodTo: summary?.period_to ?? null,
    unknownSkuRows,
    superseded,
  };
}

export interface UploadSummary {
  id: UploadId;
  exportType: string;
  fileName: string;
  status: string;
  rowCount: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  removedPiiColumns: number;
  createdAt: Date;
}

export async function listUploads(tx: Tx, shopId: ShopId, limit = 20): Promise<UploadSummary[]> {
  const rows = await tx
    .select({
      id: upload.id,
      exportType: upload.exportType,
      fileName: upload.fileName,
      status: upload.status,
      rowCount: upload.rowCount,
      periodFrom: upload.periodFrom,
      periodTo: upload.periodTo,
      removedColumns: upload.removedColumns,
      createdAt: upload.createdAt,
    })
    .from(upload)
    .where(eq(upload.shopId, shopId))
    .orderBy(desc(upload.createdAt))
    .limit(limit);
  return rows.map(({ removedColumns, ...r }) => ({
    ...r,
    id: asUploadId(r.id),
    removedPiiColumns: Array.isArray(removedColumns) ? removedColumns.filter((c: { pii?: boolean }) => c.pii).length : 0,
  }));
}
