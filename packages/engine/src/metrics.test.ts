import { generateShop, type SyntheticShop } from '@sa/parsers/synthetic';
import { asIsoDate, asIsoWeek, type IsoDate } from '@sa/shared';
import { describe, expect, it } from 'vitest';
import { allocate, computeMetrics, computeWeekMetrics, type LineFact, type ShopFacts } from './metrics';

const d = (s: string) => asIsoDate(s);

function line(over: Partial<LineFact>): LineFact {
  return {
    lineId: 'l1',
    orderHash: 'o1',
    skuId: 'A',
    status: 'completed',
    orderedOn: d('2026-10-05'),
    completedOn: d('2026-10-08'),
    quantity: 1,
    grossRevenueVnd: 100_000n,
    sellerDiscountVnd: 0n,
    ...over,
  };
}

describe('allocate', () => {
  it('splits by weight and gives the residue to the heaviest line', () => {
    expect(allocate(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
    expect(allocate(10n, [1n, 3n])).toEqual([2n, 8n]);
    expect(allocate(-10n, [1n, 3n])).toEqual([-2n, -8n]);
    expect(allocate(7n, [0n, 0n])).toEqual([4n, 3n]);
  });
});

describe('computeMetrics', () => {
  const facts: ShopFacts = {
    lines: [
      line({ lineId: 'l1', orderHash: 'o1', skuId: 'A', quantity: 2, grossRevenueVnd: 200_000n, sellerDiscountVnd: 30_000n }),
      line({ lineId: 'l2', orderHash: 'o1', skuId: 'B', quantity: 1, grossRevenueVnd: 100_000n }),
      line({ lineId: 'l3', orderHash: 'o2', skuId: 'A', status: 'cancelled', completedOn: null }),
      line({ lineId: 'l4', orderHash: 'o3', skuId: 'A', completedOn: d('2026-10-13'), grossRevenueVnd: 120_000n }),
    ],
    fees: [
      { orderHash: 'o1', skuId: null, amountVnd: 30_001n, incurredOn: d('2026-10-09') },
      { orderHash: 'o3', skuId: null, amountVnd: 12_000n, incurredOn: d('2026-10-15') },
      { orderHash: 'o2', skuId: null, amountVnd: 5_000n, incurredOn: d('2026-10-10') },
      { orderHash: 'gone', skuId: null, amountVnd: 1_000n, incurredOn: d('2026-10-10') },
    ],
    costs: [
      { skuId: 'A', effectiveFrom: d('2026-10-10'), cogsVnd: 50_000n, packagingVnd: 5_000n },
      { skuId: 'A', effectiveFrom: d('2026-10-12'), cogsVnd: 60_000n, packagingVnd: 5_000n },
    ],
    stock: [{ skuId: 'A', asOf: d('2026-10-11'), onHand: 30 }],
  };
  const { metrics, unallocatedFees } = computeMetrics(facts);
  const a41 = metrics.find((m) => m.skuId === 'A' && m.isoWeek === '2026-W41');
  const b41 = metrics.find((m) => m.skuId === 'B');
  const a42 = metrics.find((m) => m.skuId === 'A' && m.isoWeek === '2026-W42');

  it('computes revenue, allocated discount and fees, cost and margin for completed lines only', () => {
    // Order o1: discount 30.000 split 2:1, fees 30.001 split 2:1 with the residue on the heavier line
    expect(a41).toMatchObject({
      units: 2,
      orders: 1,
      grossRevenueVnd: 200_000n,
      sellerDiscountVnd: 20_000n,
      netRevenueVnd: 180_000n,
      platformFeesVnd: 20_001n,
      cogsVnd: 110_000n,
      contributionMarginVnd: 49_999n,
      marginPct: 0.2778,
      avgSellingPriceVnd: 90_000n,
      onHand: 30,
    });
    expect(b41).toMatchObject({ netRevenueVnd: 90_000n, platformFeesVnd: 10_000n, cogsVnd: null, contributionMarginVnd: null, marginPct: null, onHand: null, stockCoverDays: null });
  });

  it('uses the cost effective on the order date, and the earliest cost for older orders', () => {
    expect(a41?.cogsVnd).toBe(110_000n);
    const later = computeMetrics({ ...facts, lines: [line({ orderedOn: d('2026-10-12') })] }).metrics[0];
    expect(later?.cogsVnd).toBe(65_000n);
  });

  it('keeps fees of orders without completed lines as unallocated, so totals reconcile', () => {
    expect(unallocatedFees).toEqual([{ isoWeek: '2026-W41', amountVnd: 6_000n }]);
    const allocated = metrics.reduce((s, m) => s + m.platformFeesVnd, 0n);
    expect(allocated + 6_000n).toBe(facts.fees.reduce((s, f) => s + f.amountVnd, 0n));
  });

  it('computes 28-day velocity and stock cover', () => {
    expect(a42?.avgDailyUnits28d).toBe(0.1071);
    expect(a42?.stockCoverDays).toBe(280);
    expect(computeWeekMetrics(facts, asIsoWeek('2026-W42'))).toHaveLength(1);
  });
});

function factsOf(shop: SyntheticShop): ShopFacts {
  const skuId = (i: number) => `sku-${i}`;
  const index = new Map(shop.skus.map((s, i) => [s, i]));
  const lines: LineFact[] = [];
  const fees: ShopFacts['fees'][number][] = [];
  for (const o of shop.orders) {
    o.lines.forEach((l, i) => {
      lines.push({
        lineId: `${o.orderId}-${i}`,
        orderHash: o.orderId,
        skuId: skuId(index.get(l.sku) ?? 0),
        status: o.status,
        orderedOn: o.orderedOn,
        completedOn: o.completedOn,
        quantity: l.quantity,
        grossRevenueVnd: l.sku.dealPriceVnd * BigInt(l.quantity),
        sellerDiscountVnd: i === 0 ? o.sellerVoucherVnd : 0n,
      });
    });
    for (const amount of Object.values(o.fees)) {
      if (amount > 0n) fees.push({ orderHash: o.orderId, skuId: null, amountVnd: amount, incurredOn: (o.paidOn ?? o.orderedOn) as IsoDate });
    }
  }
  const costs = shop.skus.flatMap((s, i) => (s.cogsVnd === null ? [] : [{ skuId: skuId(i), effectiveFrom: shop.from, cogsVnd: s.cogsVnd, packagingVnd: s.packagingVnd }]));
  return { lines, fees, costs, stock: [] };
}

describe('synthetic shop', () => {
  it('reconciles every fee and discount exactly', () => {
    const shop = generateShop({ days: 120, products: 20 });
    const facts = factsOf(shop);
    const { metrics, unallocatedFees } = computeMetrics(facts);
    const fees = metrics.reduce((s, m) => s + m.platformFeesVnd, 0n) + unallocatedFees.reduce((s, u) => s + u.amountVnd, 0n);
    expect(fees).toBe(facts.fees.reduce((s, f) => s + f.amountVnd, 0n));
    const completedDiscount = shop.orders.filter((o) => o.status === 'completed').reduce((s, o) => s + o.sellerVoucherVnd, 0n);
    expect(metrics.reduce((s, m) => s + m.sellerDiscountVnd, 0n)).toBe(completedDiscount);
    expect(metrics.some((m) => m.cogsVnd === null)).toBe(true);
  });

  it('computes a quarter of 50k order lines well inside the budget', () => {
    const shop = generateShop({ days: 91, products: 100, ordersPerDay: 440 });
    const facts = factsOf(shop);
    expect(facts.lines.length).toBeGreaterThan(50_000);
    const started = performance.now();
    computeMetrics(facts);
    expect(performance.now() - started).toBeLessThan(3_000);
  }, 60_000);
});
