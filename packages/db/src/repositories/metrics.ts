import { createHash } from 'node:crypto';
import { asSkuId, type ShopId, type SkuId } from '@sa/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../context';
import { skuWeekMetric } from '../schema';
import { rowsOf } from './rows';

const ict = (column: string) => sql.raw(`(((${column}) at time zone 'UTC') + interval '7 hours')::date::text`);

export interface LoadedFacts {
  lines: {
    lineId: string;
    orderHash: string;
    skuId: string;
    status: 'completed' | 'cancelled' | 'returned' | 'in_progress';
    orderedOn: string;
    completedOn: string | null;
    quantity: number;
    grossRevenueVnd: bigint;
    sellerDiscountVnd: bigint;
  }[];
  fees: { orderHash: string; skuId: string | null; amountVnd: bigint; incurredOn: string }[];
  costs: { skuId: string; effectiveFrom: string; cogsVnd: bigint; packagingVnd: bigint }[];
  stock: { skuId: string; asOf: string; onHand: number }[];
}

// With skuIds, loads every line of the orders those SKUs appear in, because order fees are shared across lines
export async function loadShopFacts(tx: Tx, shopId: ShopId, skuIds?: readonly SkuId[]): Promise<LoadedFacts> {
  const scoped = skuIds && skuIds.length > 0;
  const orderFilter = scoped
    ? sql`and o.order_hash in (select x.order_hash from app.order_line x where x.shop_id = ${shopId} and x.sku_id in ${skuIds})`
    : sql``;
  const lines = rowsOf<{
    id: string; order_hash: string; sku_id: string; order_status: LoadedFacts['lines'][number]['status'];
    ordered_on: string; completed_on: string | null; quantity: number; gross: string; discount: string;
  }>(
    await tx.execute(sql`
      select o.id, o.order_hash, o.sku_id, o.order_status, ${ict('o.ordered_at')} as ordered_on,
        ${ict('o.completed_at')} as completed_on, o.quantity, o.gross_revenue_vnd::text as gross, o.seller_discount_vnd::text as discount
      from app.order_line o where o.shop_id = ${shopId} ${orderFilter}`),
  );
  const fees = rowsOf<{ order_hash: string; sku_id: string | null; amount: string; incurred_on: string }>(
    await tx.execute(sql`
      select f.order_hash, f.sku_id, f.amount_vnd::text as amount, f.incurred_on::text as incurred_on
      from app.fee_line f where f.shop_id = ${shopId}
      ${scoped ? sql`and f.order_hash in (select x.order_hash from app.order_line x where x.shop_id = ${shopId} and x.sku_id in ${skuIds})` : sql``}`),
  );
  const skuFilter = scoped ? sql`and sku_id in ${skuIds}` : sql``;
  const costs = rowsOf<{ sku_id: string; effective_from: string; cogs: string; packaging: string }>(
    await tx.execute(sql`
      select sku_id, effective_from::text as effective_from, cogs_vnd::text as cogs, packaging_vnd::text as packaging
      from app.unit_cost where shop_id = ${shopId} ${skuFilter}`),
  );
  const stock = rowsOf<{ sku_id: string; as_of: string; on_hand: number }>(
    await tx.execute(sql`select sku_id, as_of::text as as_of, on_hand from app.stock_snapshot where shop_id = ${shopId} ${skuFilter}`),
  );
  return {
    lines: lines.map((r) => ({
      lineId: r.id, orderHash: r.order_hash, skuId: r.sku_id, status: r.order_status, orderedOn: r.ordered_on,
      completedOn: r.completed_on, quantity: r.quantity, grossRevenueVnd: BigInt(r.gross), sellerDiscountVnd: BigInt(r.discount),
    })),
    fees: fees.map((r) => ({ orderHash: r.order_hash, skuId: r.sku_id, amountVnd: BigInt(r.amount), incurredOn: r.incurred_on })),
    costs: costs.map((r) => ({ skuId: r.sku_id, effectiveFrom: r.effective_from, cogsVnd: BigInt(r.cogs), packagingVnd: BigInt(r.packaging) })),
    stock: stock.map((r) => ({ skuId: r.sku_id, asOf: r.as_of, onHand: r.on_hand })),
  };
}

export interface MetricRow {
  skuId: string;
  isoWeek: string;
  units: number;
  orders: number;
  grossRevenueVnd: bigint;
  sellerDiscountVnd: bigint;
  netRevenueVnd: bigint;
  platformFeesVnd: bigint;
  cogsVnd: bigint | null;
  contributionMarginVnd: bigint | null;
  marginPct: number | null;
  avgSellingPriceVnd: bigint | null;
  onHand: number | null;
  stockCoverDays: number | null;
}

const clamp = (x: number, limit: number) => Math.max(-limit, Math.min(limit, x));

// numeric(8,2) cannot hold Infinity, so "no recent sales" is stored as the column maximum
export const STOCK_COVER_MAX = 999_999.99;

function fixed(value: number | null, decimals: number, limit: number): string | null {
  if (value === null || Number.isNaN(value)) return null;
  return clamp(value, limit).toFixed(decimals);
}

// A ratio beyond the column range isn't a meaningful margin, so it is stored as unknown rather than clamped
function ratio(value: number | null): string | null {
  return value === null || !Number.isFinite(value) || Math.abs(value) > 999.9999 ? null : value.toFixed(4);
}

function stockCover(stored: string | null): number | null {
  if (stored === null) return null;
  const n = Number(stored);
  return n >= STOCK_COVER_MAX ? Number.POSITIVE_INFINITY : n;
}

function toRow(shopId: ShopId, m: MetricRow) {
  const row = {
    shopId,
    skuId: m.skuId,
    isoWeek: m.isoWeek,
    units: m.units,
    orders: m.orders,
    grossRevenueVnd: m.grossRevenueVnd,
    sellerDiscountVnd: m.sellerDiscountVnd,
    netRevenueVnd: m.netRevenueVnd,
    platformFeesVnd: m.platformFeesVnd,
    cogsVnd: m.cogsVnd,
    contributionMarginVnd: m.contributionMarginVnd,
    marginPct: ratio(m.marginPct),
    avgSellingPriceVnd: m.avgSellingPriceVnd,
    onHand: m.onHand,
    stockCoverDays: fixed(m.stockCoverDays, 2, STOCK_COVER_MAX),
  };
  const inputsHash = createHash('sha256')
    .update(JSON.stringify(row, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)))
    .digest('hex');
  return { ...row, inputsHash };
}

export interface SaveSummary {
  written: number;
  unchanged: number;
  deleted: number;
}

// Rows whose content hash is unchanged are skipped; rows no longer produced are deleted
export async function saveMetrics(tx: Tx, shopId: ShopId, metrics: readonly MetricRow[], skuIds?: readonly SkuId[]): Promise<SaveSummary> {
  const scope = skuIds && skuIds.length > 0 ? inArray(skuWeekMetric.skuId, [...skuIds]) : undefined;
  const existing = await tx
    .select({ skuId: skuWeekMetric.skuId, isoWeek: skuWeekMetric.isoWeek, hash: skuWeekMetric.inputsHash })
    .from(skuWeekMetric)
    .where(and(eq(skuWeekMetric.shopId, shopId), scope));
  const known = new Map(existing.map((e) => [`${e.skuId}|${e.isoWeek}`, e.hash]));
  const rows = metrics.map((m) => toRow(shopId, m));
  const changed = rows.filter((r) => known.get(`${r.skuId}|${r.isoWeek}`) !== r.inputsHash);
  const produced = new Set(rows.map((r) => `${r.skuId}|${r.isoWeek}`));
  const stale = existing.filter((e) => !produced.has(`${e.skuId}|${e.isoWeek}`));

  for (let i = 0; i < changed.length; i += 500) {
    await tx
      .insert(skuWeekMetric)
      .values(changed.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [skuWeekMetric.shopId, skuWeekMetric.skuId, skuWeekMetric.isoWeek],
        set: {
          units: sql`excluded.units`, orders: sql`excluded.orders`, grossRevenueVnd: sql`excluded.gross_revenue_vnd`,
          sellerDiscountVnd: sql`excluded.seller_discount_vnd`, netRevenueVnd: sql`excluded.net_revenue_vnd`,
          platformFeesVnd: sql`excluded.platform_fees_vnd`, cogsVnd: sql`excluded.cogs_vnd`,
          contributionMarginVnd: sql`excluded.contribution_margin_vnd`, marginPct: sql`excluded.margin_pct`,
          avgSellingPriceVnd: sql`excluded.avg_selling_price_vnd`, onHand: sql`excluded.on_hand`,
          stockCoverDays: sql`excluded.stock_cover_days`, inputsHash: sql`excluded.inputs_hash`, computedAt: sql`now()`,
        },
      });
  }
  for (let i = 0; i < stale.length; i += 500) {
    const batch = stale.slice(i, i + 500);
    await tx.execute(sql`
      delete from app.sku_week_metric m where m.shop_id = ${shopId}
        and (m.sku_id::text || '|' || m.iso_week) in ${batch.map((s) => `${s.skuId}|${s.isoWeek}`)}`);
  }
  return { written: changed.length, unchanged: rows.length - changed.length, deleted: stale.length };
}

export async function listMetricWeeks(tx: Tx, shopId: ShopId): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ isoWeek: skuWeekMetric.isoWeek })
    .from(skuWeekMetric)
    .where(eq(skuWeekMetric.shopId, shopId))
    .orderBy(sql`${skuWeekMetric.isoWeek} desc`);
  return rows.map((r) => r.isoWeek);
}

export interface WeekProfitRow {
  skuId: SkuId;
  name: string;
  variation: string | null;
  units: number;
  netRevenueVnd: bigint;
  platformFeesVnd: bigint;
  cogsVnd: bigint | null;
  contributionMarginVnd: bigint | null;
  marginPct: number | null;
}

export async function readWeekProfit(tx: Tx, shopId: ShopId, isoWeek: string): Promise<WeekProfitRow[]> {
  const rows = rowsOf<{
    sku_id: string; name: string; variation: string | null; units: number; net: string; fees: string;
    cogs: string | null; cm: string | null; margin: string | null;
  }>(
    await tx.execute(sql`
      select m.sku_id, s.name, s.variation, m.units, m.net_revenue_vnd::text as net, m.platform_fees_vnd::text as fees,
        m.cogs_vnd::text as cogs, m.contribution_margin_vnd::text as cm, m.margin_pct::text as margin
      from app.sku_week_metric m
      join app.sku s on s.shop_id = m.shop_id and s.id = m.sku_id
      where m.shop_id = ${shopId} and m.iso_week = ${isoWeek}
      order by m.net_revenue_vnd desc, s.name`),
  );
  return rows.map((r) => ({
    skuId: asSkuId(r.sku_id),
    name: r.name,
    variation: r.variation,
    units: r.units,
    netRevenueVnd: BigInt(r.net),
    platformFeesVnd: BigInt(r.fees),
    cogsVnd: r.cogs === null ? null : BigInt(r.cogs),
    contributionMarginVnd: r.cm === null ? null : BigInt(r.cm),
    marginPct: r.margin === null ? null : Number(r.margin),
  }));
}

// Fees of orders with no completed line in the data; the engine reports the same amount as unallocated
export async function readUnallocatedFees(tx: Tx, shopId: ShopId, from: string, to: string): Promise<bigint> {
  const [row] = rowsOf<{ total: string | null }>(
    await tx.execute(sql`
      select sum(f.amount_vnd)::text as total from app.fee_line f
      where f.shop_id = ${shopId} and f.incurred_on between ${from}::date and ${to}::date
        and not exists (select 1 from app.order_line o where o.shop_id = f.shop_id and o.order_hash = f.order_hash
          and o.order_status = 'completed' and o.completed_at is not null)`),
  );
  return row?.total ? BigInt(row.total) : 0n;
}

export interface SourceLine {
  fileName: string;
  sourceRow: number;
  orderedAt: Date;
  completedAt: Date | null;
  quantity: number;
  grossRevenueVnd: bigint;
  sellerDiscountVnd: bigint;
}

export interface SkuWeekDetail {
  name: string;
  variation: string | null;
  metric: (MetricRow & { avgSellingPriceVnd: bigint | null }) | null;
  lines: SourceLine[];
}

export async function readSkuWeek(tx: Tx, shopId: ShopId, skuId: SkuId, isoWeek: string, from: string, to: string): Promise<SkuWeekDetail | null> {
  const [skuRow] = rowsOf<{ name: string; variation: string | null }>(
    await tx.execute(sql`select name, variation from app.sku where shop_id = ${shopId} and id = ${skuId}`),
  );
  if (!skuRow) return null;
  const [m] = await tx
    .select()
    .from(skuWeekMetric)
    .where(and(eq(skuWeekMetric.shopId, shopId), eq(skuWeekMetric.skuId, skuId), eq(skuWeekMetric.isoWeek, isoWeek)));
  const lines = rowsOf<{ file_name: string; source_row: number; ordered_at: string; completed_at: string | null; quantity: number; gross: string; discount: string }>(
    await tx.execute(sql`
      select u.file_name, o.source_row, o.ordered_at::text as ordered_at, o.completed_at::text as completed_at, o.quantity,
        o.gross_revenue_vnd::text as gross, o.seller_discount_vnd::text as discount
      from app.order_line o
      join app.upload u on u.shop_id = o.shop_id and u.id = o.upload_id
      where o.shop_id = ${shopId} and o.sku_id = ${skuId} and o.order_status = 'completed'
        and ${ict('o.completed_at')}::date between ${from}::date and ${to}::date
      order by o.completed_at, o.source_row
      limit 500`),
  );
  return {
    name: skuRow.name,
    variation: skuRow.variation,
    metric: m
      ? {
          skuId: m.skuId, isoWeek: m.isoWeek, units: m.units, orders: m.orders, grossRevenueVnd: m.grossRevenueVnd,
          sellerDiscountVnd: m.sellerDiscountVnd, netRevenueVnd: m.netRevenueVnd, platformFeesVnd: m.platformFeesVnd,
          cogsVnd: m.cogsVnd, contributionMarginVnd: m.contributionMarginVnd, marginPct: m.marginPct === null ? null : Number(m.marginPct),
          avgSellingPriceVnd: m.avgSellingPriceVnd, onHand: m.onHand,
          stockCoverDays: stockCover(m.stockCoverDays),
        }
      : null,
    lines: lines.map((r) => ({
      fileName: r.file_name, sourceRow: r.source_row, orderedAt: new Date(r.ordered_at),
      completedAt: r.completed_at ? new Date(r.completed_at) : null, quantity: r.quantity,
      grossRevenueVnd: BigInt(r.gross), sellerDiscountVnd: BigInt(r.discount),
    })),
  };
}
