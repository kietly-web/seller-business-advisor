import type { PGlite } from '@electric-sql/pglite';
import { createShop, listMetricWeeks, saveMetrics, listSkuCosts, readSkuWeek, readUnallocatedFees, readWeekProfit, withShopContext, withUserContext, type Db } from '@sa/db';
import { createTestDb } from '@sa/db/testing';
import { asIsoDate, asIsoWeek, asSkuId, asUserId, weekEnd, weekStart, type ShopId } from '@sa/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saveCost } from './costs';
import { seedDemoShop } from './demo-seed';
import { recomputeMetrics } from './metrics';

const TODAY = asIsoDate('2026-11-05');
let client: PGlite;
let db: Db;
let who: { userId: string; shopId: ShopId };

const inShop = <T>(fn: Parameters<typeof withShopContext<T>>[2]) =>
  withShopContext(db, { role: 'sa_app', shopId: who.shopId, userId: asUserId(who.userId) }, fn);

async function scalar(query: string): Promise<string> {
  return client.transaction(async (t) => {
    await t.query('set local role sa_app');
    await t.query("select set_config('app.shop_id', $1, true), set_config('app.user_id', $2, true)", [who.shopId, who.userId]);
    const rows = (await t.query<{ v: string }>(query)).rows;
    return rows[0]?.v ?? '';
  });
}

beforeAll(async () => {
  ({ client, db } = await createTestDb());
  const shopId = await withUserContext(db, asUserId('metrics-owner'), (tx) => createShop(tx, { name: 'Demo', category: null, isDemo: true }));
  who = { userId: 'metrics-owner', shopId };
  await seedDemoShop(db, who, TODAY);
}, 180_000);

afterAll(async () => {
  await client.close();
});

describe('weekly metrics on the demo shop', () => {
  it('reconciles stored fees with every fee line', async () => {
    const allocated = BigInt(await scalar('select sum(platform_fees_vnd)::text as v from app.sku_week_metric'));
    const total = BigInt(await scalar('select sum(amount_vnd)::text as v from app.fee_line'));
    const unallocated = await inShop((tx) => readUnallocatedFees(tx, who.shopId, '2000-01-01', '2100-01-01'));
    expect(allocated + unallocated).toBe(total);
    expect(allocated).toBeGreaterThan(0n);
  });

  it('matches net revenue to completed order lines', async () => {
    const net = BigInt(await scalar('select sum(net_revenue_vnd)::text as v from app.sku_week_metric'));
    const lines = BigInt(
      await scalar("select (sum(gross_revenue_vnd) - sum(seller_discount_vnd))::text as v from app.order_line where order_status = 'completed'"),
    );
    expect(net).toBe(lines);
  });

  it('skips unchanged rows on a second run', async () => {
    const summary = await recomputeMetrics(db, who);
    expect(summary.written).toBe(0);
    expect(summary.unchanged).toBeGreaterThan(1000);
    expect((await recomputeMetrics(db, { shopId: who.shopId, role: 'sa_worker' })).written).toBe(0);
  });

  it('leaves margin empty for SKUs without a cost until one is entered', async () => {
    const [missing] = (await inShop((tx) => listSkuCosts(tx, who.shopId, TODAY))).filter((c) => c.cogsVnd === null);
    if (!missing) throw new Error('demo shop should have SKUs without cost');
    const before = await scalar(`select count(*)::text as v from app.sku_week_metric where sku_id = '${missing.skuId}' and cogs_vnd is not null`);
    expect(before).toBe('0');
    const form = new FormData();
    form.set('skuId', missing.skuId);
    form.set('cogs', '50.000');
    expect(await saveCost(db, who, form, TODAY)).toBe(true);
    const nulls = await scalar(`select count(*)::text as v from app.sku_week_metric where sku_id = '${missing.skuId}' and cogs_vnd is null`);
    expect(nulls).toBe('0');
  });

  it('serves the week view and drills down to source rows', async () => {
    const weeks = await inShop((tx) => listMetricWeeks(tx, who.shopId));
    expect(weeks.length).toBeGreaterThan(40);
    const week = asIsoWeek(weeks[2] ?? '');
    const rows = await inShop((tx) => readWeekProfit(tx, who.shopId, week));
    const top = rows[0];
    if (!top) throw new Error('no rows');
    const detail = await inShop((tx) => readSkuWeek(tx, who.shopId, top.skuId, week, weekStart(week), weekEnd(week)));
    expect(detail?.metric?.netRevenueVnd).toBe(top.netRevenueVnd);
    const gross = detail?.lines.reduce((s, l) => s + l.grossRevenueVnd, 0n);
    expect(gross).toBe(detail?.metric?.grossRevenueVnd);
    expect(detail?.lines.every((l) => l.fileName === 'demo-don-hang.csv' && l.sourceRow > 1)).toBe(true);
  });

  it('stores infinite stock cover and deletes rows a recompute no longer produces', async () => {
    const skuId = await scalar('select id::text as v from app.sku limit 1');
    await inShop((tx) =>
      saveMetrics(tx, who.shopId, [
        {
          skuId, isoWeek: '2020-W01', units: 0, orders: 0, grossRevenueVnd: 0n, sellerDiscountVnd: 0n, netRevenueVnd: 0n,
          platformFeesVnd: 0n, cogsVnd: null, contributionMarginVnd: null, marginPct: -5000, avgSellingPriceVnd: null,
          onHand: 5, stockCoverDays: Number.POSITIVE_INFINITY,
        },
      ], [asSkuId(skuId)]),
    );
    expect(await scalar("select stock_cover_days::text || '|' || margin_pct::text as v from app.sku_week_metric where iso_week = '2020-W01'")).toBe(
      '999999.99|-999.9999',
    );
    const detail = await inShop((tx) => readSkuWeek(tx, who.shopId, asSkuId(skuId), '2020-W01', '2019-12-30', '2020-01-05'));
    expect(detail?.metric?.stockCoverDays).toBe(Number.POSITIVE_INFINITY);
    expect((await recomputeMetrics(db, who)).deleted).toBe(1);
  });
});
