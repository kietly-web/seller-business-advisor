import { generateShop } from '@sa/parsers/synthetic';
import { addWeeks, asIsoDate, isoWeekOf, type IsoDate } from '@sa/shared';
import { describe, expect, it } from 'vitest';
import { context, series, sku } from './golden/builders';
import { computeMetrics, type LineFact, type ShopFacts } from './metrics';
import { planRecommendations } from './plan';
import { renderCard } from './rules/templates';

describe('learned confidence', () => {
  const base = () => context({ metrics: series('B', 8, { unitCost: 95_000n }), skus: [sku('B')] });

  it('raises and lowers confidence from outcomes, within [0.5, 1.5]', () => {
    const plain = planRecommendations(base()).recommendations[0];
    const good = planRecommendations({ ...base(), learned: { shop: { NEGATIVE_MARGIN: { alpha: 20, beta: 0 } }, global: { NEGATIVE_MARGIN: { alpha: 2, beta: 2 } } } }).recommendations[0];
    const bad = planRecommendations({ ...base(), learned: { shop: { NEGATIVE_MARGIN: { alpha: 0, beta: 50 } }, global: {} } }).recommendations[0];
    expect(plain?.learned).toBe(1);
    expect(good?.learned).toBeGreaterThan(1);
    expect(good?.learned).toBeLessThanOrEqual(1.5);
    expect(bad?.learned).toBe(0.5);
    expect((good?.score ?? 0) > (plain?.score ?? 0)).toBe(true);
  });
});

describe('demo shop end to end', () => {
  it('turns 12 months of synthetic orders into at most five filled cards', () => {
    const shop = generateShop();
    const ids = new Map(shop.skus.map((s, i) => [s, `sku-${i}`]));
    const lines: LineFact[] = [];
    const fees: ShopFacts['fees'][number][] = [];
    for (const o of shop.orders) {
      o.lines.forEach((l, i) =>
        lines.push({
          lineId: `${o.orderId}-${i}`, orderHash: o.orderId, skuId: ids.get(l.sku) ?? '', status: o.status, orderedOn: o.orderedOn,
          completedOn: o.completedOn, quantity: l.quantity, grossRevenueVnd: l.sku.dealPriceVnd * BigInt(l.quantity), sellerDiscountVnd: i === 0 ? o.sellerVoucherVnd : 0n,
        }),
      );
      for (const amount of Object.values(o.fees)) if (amount > 0n) fees.push({ orderHash: o.orderId, skuId: null, amountVnd: amount, incurredOn: (o.paidOn ?? o.orderedOn) as IsoDate });
    }
    const costs = shop.skus.flatMap((s) => (s.cogsVnd === null ? [] : [{ skuId: ids.get(s) ?? '', effectiveFrom: shop.from, cogsVnd: s.cogsVnd, packagingVnd: s.packagingVnd }]));
    const { metrics } = computeMetrics({ lines, fees, costs, stock: [] });
    const week = addWeeks(isoWeekOf(shop.to), -1);
    const plan = planRecommendations({
      week,
      targetMarginPct: 0.15,
      metrics,
      skus: shop.skus.map((s) => ({
        skuId: ids.get(s) ?? '', name: s.name, variation: s.variation, firstOrderOn: asIsoDate('2025-11-01'),
        unitCostVnd: s.cogsVnd === null ? null : s.cogsVnd + s.packagingVnd, onHand: s.onHand, stockAsOf: shop.to, leadTimeDays: s.leadTimeDays,
      })),
    });
    expect(plan.status).toBe('ok');
    expect(plan.recommendations.length).toBeGreaterThan(0);
    expect(plan.recommendations.length).toBeLessThanOrEqual(5);
    expect(plan.missingCosts.length).toBeGreaterThan(0);
    for (const r of plan.recommendations) {
      expect(JSON.stringify(renderCard(r.ruleCode, r.facts))).not.toContain('{{');
    }
  });
});
