import { asIsoDate, asIsoWeek } from '@sa/shared';
import type { DropReason } from '../plan';
import type { ActionType, Facts, RuleCode, RuleContext, SkipReason } from '../rules/types';
import { context, series, sku } from './builders';

export interface Expected {
  status?: 'ok' | 'insufficient_data';
  recommended?: { ruleCode: RuleCode; skuId: string; rank?: number; actionType?: ActionType; facts?: Facts }[];
  absent?: { ruleCode: RuleCode; skuId: string }[];
  dropped?: { ruleCode: RuleCode; skuId: string; reason: DropReason }[];
  skipped?: { ruleCode: RuleCode; reason: SkipReason }[];
  missingCosts?: string[];
  maxPerActionType?: number;
  count?: number;
}

export interface Scenario {
  name: string;
  ctx: RuleContext;
  expect: Expected;
}

const steady = (id: string, base = {}, shapes = {}) => series(id, 8, base, shapes);
const comp = (entries: [string, bigint][]) => new Map(entries.map(([id, medianVnd]) => [id, { medianVnd, listings: 3 }]));
const traffic = (entries: [string, number, number, number][]) =>
  new Map(entries.map(([id, views, visitors, orders]) => [id, { views, visitors, orders }]));
const shopTraffic: [string, number, number, number][] = [
  ['T1', 400, 1000, 40],
  ['T2', 300, 1000, 40],
  ['T3', 200, 1000, 40],
];
const trafficSkus = ['T1', 'T2', 'T3'];

export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'underpriced SKU below target margin gets a capped price rise',
    ctx: context({ metrics: steady('A', { unitCost: 80_000n }), skus: [sku('A')], competitors: comp([['A', 120_000n]]) }),
    expect: {
      status: 'ok',
      recommended: [
        {
          ruleCode: 'MARGIN_BELOW_TARGET_UNDERPRICED',
          skuId: 'A',
          rank: 1,
          actionType: 'raise_price',
          facts: { current_price: '100.000\u00a0₫', suggested_price: '108.000\u00a0₫', margin_pct: '10%', target_margin_pct: '15%', competitor_count: '3' },
        },
      ],
      skipped: [
        { ruleCode: 'STOCKOUT_RISK', reason: 'no_stock_data' },
        { ruleCode: 'PRICE_ABOVE_MARKET_LOW_CONVERSION', reason: 'no_traffic_data' },
      ],
    },
  },
  {
    name: 'underpriced rule stays quiet when the price gap is under 5%',
    ctx: context({ metrics: steady('A', { unitCost: 80_000n }), skus: [sku('A')], competitors: comp([['A', 104_000n]]) }),
    expect: { absent: [{ ruleCode: 'MARGIN_BELOW_TARGET_UNDERPRICED', skuId: 'A' }] },
  },
  {
    name: 'underpriced rule needs at least 10 units in 28 days',
    ctx: context({ metrics: steady('A', { unitCost: 80_000n, units: 2 }), skus: [sku('A')], competitors: comp([['A', 120_000n]]) }),
    expect: { absent: [{ ruleCode: 'MARGIN_BELOW_TARGET_UNDERPRICED', skuId: 'A' }] },
  },
  {
    name: 'two loss-making weeks with a shop discount: stop the discount',
    ctx: context({ metrics: steady('B', { unitCost: 95_000n }, { 0: { discount: 50_000n } }), skus: [sku('B')] }),
    expect: { recommended: [{ ruleCode: 'NEGATIVE_MARGIN', skuId: 'B', actionType: 'stop_discount', facts: { weeks_negative: '2', seller_discount: '50.000\u00a0₫' } }] },
  },
  {
    name: 'one loss-making week is not enough',
    ctx: context({ metrics: steady('B', {}, { 0: { unitCost: 95_000n } }), skus: [sku('B')] }),
    expect: { absent: [{ ruleCode: 'NEGATIVE_MARGIN', skuId: 'B' }] },
  },
  {
    name: 'stock below lead time plus a week: restock',
    ctx: context({ metrics: steady('C'), skus: [sku('C', { onHand: 10, leadTimeDays: 21, stockAsOf: asIsoDate('2026-11-01') })] }),
    expect: { recommended: [{ ruleCode: 'STOCKOUT_RISK', skuId: 'C', actionType: 'restock', facts: { on_hand: '10', days_of_stock: '3', suggested_qty: '76', units_per_day: '2,9' } }] },
  },
  {
    name: 'plenty of stock: no restock',
    ctx: context({ metrics: steady('C'), skus: [sku('C', { onHand: 100, leadTimeDays: 21 })] }),
    expect: { absent: [{ ruleCode: 'STOCKOUT_RISK', skuId: 'C' }] },
  },
  {
    name: 'old SKU with stock and no sales for 28 days: clearance',
    ctx: context({
      metrics: [...series('D', 8, {}, { 0: { units: 0 }, 1: { units: 0 }, 2: { units: 0 }, 3: { units: 0 } }).filter((m) => m.units > 0), ...steady('X')],
      skus: [sku('D', { onHand: 50, unitCostVnd: 40_000n, firstOrderOn: asIsoDate('2026-06-01') }), sku('X')],
    }),
    expect: { recommended: [{ ruleCode: 'DEAD_STOCK', skuId: 'D', actionType: 'clearance', facts: { on_hand: '50', stock_value: '2.000.000\u00a0₫' } }] },
  },
  {
    name: 'a SKU first sold less than 45 days ago is not dead stock',
    ctx: context({ metrics: steady('X'), skus: [sku('D', { onHand: 50, firstOrderOn: asIsoDate('2026-10-01') }), sku('X')] }),
    expect: { absent: [{ ruleCode: 'DEAD_STOCK', skuId: 'D' }] },
  },
  {
    name: 'price well above market with weak conversion: review the price',
    ctx: context({
      metrics: [...steady('P'), ...trafficSkus.flatMap((id) => steady(id))],
      skus: [sku('P'), ...trafficSkus.map((id) => sku(id))],
      competitors: comp([['P', 87_000n]]),
      traffic28d: traffic([...shopTraffic, ['P', 100, 1000, 10]]),
    }),
    expect: { recommended: [{ ruleCode: 'PRICE_ABOVE_MARKET_LOW_CONVERSION', skuId: 'P', actionType: 'lower_price', facts: { conversion_pct: '1%', shop_conversion_pct: '4%' } }] },
  },
  {
    name: 'price only 8% above market: no price review',
    ctx: context({
      metrics: [...steady('P'), ...trafficSkus.flatMap((id) => steady(id))],
      skus: [sku('P'), ...trafficSkus.map((id) => sku(id))],
      competitors: comp([['P', 92_600n]]),
      traffic28d: traffic([...shopTraffic, ['P', 100, 1000, 10]]),
    }),
    expect: { absent: [{ ruleCode: 'PRICE_ABOVE_MARKET_LOW_CONVERSION', skuId: 'P' }] },
  },
  {
    name: 'many views, poor conversion, fair price: improve the listing',
    ctx: context({
      metrics: [...steady('V'), ...trafficSkus.flatMap((id) => steady(id))],
      skus: [sku('V'), ...trafficSkus.map((id) => sku(id))],
      competitors: comp([['V', 100_000n]]),
      traffic28d: traffic([...shopTraffic, ['V', 5000, 2000, 20]]),
    }),
    expect: { recommended: [{ ruleCode: 'HIGH_VIEWS_LOW_CONVERSION', skuId: 'V', actionType: 'improve_listing', facts: { views: '5000' } }] },
  },
  {
    name: 'conversion at three quarters of the shop median: listing is fine',
    ctx: context({
      metrics: [...steady('V'), ...trafficSkus.flatMap((id) => steady(id))],
      skus: [sku('V'), ...trafficSkus.map((id) => sku(id))],
      competitors: comp([['V', 100_000n]]),
      traffic28d: traffic([...shopTraffic, ['V', 5000, 2000, 60]]),
    }),
    expect: { absent: [{ ruleCode: 'HIGH_VIEWS_LOW_CONVERSION', skuId: 'V' }] },
  },
  {
    name: 'campaign week sold at a loss without doubling units: skip next time',
    ctx: context({ metrics: steady('K', {}, { 3: { units: 25, price: 60_000n } }), skus: [sku('K')] }),
    expect: { recommended: [{ ruleCode: 'CAMPAIGN_UNPROFITABLE', skuId: 'K', actionType: 'skip_campaign', facts: { campaign_units: '25', normal_units_per_week: '20' } }] },
  },
  {
    name: 'campaign that tripled units is not flagged',
    ctx: context({ metrics: steady('K', {}, { 3: { units: 60, price: 60_000n } }), skus: [sku('K')] }),
    expect: { absent: [{ ruleCode: 'CAMPAIGN_UNPROFITABLE', skuId: 'K' }] },
  },
  {
    name: 'fewer than 4 weeks of history: insufficient data',
    ctx: context({ metrics: series('B', 3, { unitCost: 95_000n }), skus: [sku('B')] }),
    expect: { status: 'insufficient_data', count: 0 },
  },
  {
    name: 'same rule and SKU shown last week is in cooldown; three weeks ago is not',
    ctx: context({
      metrics: [...steady('A', { unitCost: 80_000n }), ...steady('A2', { unitCost: 80_000n })],
      skus: [sku('A'), sku('A2')],
      competitors: comp([['A', 120_000n], ['A2', 120_000n]]),
      history: [
        { ruleCode: 'MARGIN_BELOW_TARGET_UNDERPRICED', skuId: 'A', isoWeek: asIsoWeek('2026-W43'), status: 'shown', dismissReason: null },
        { ruleCode: 'MARGIN_BELOW_TARGET_UNDERPRICED', skuId: 'A2', isoWeek: asIsoWeek('2026-W41'), status: 'shown', dismissReason: null },
      ],
    }),
    expect: {
      dropped: [{ ruleCode: 'MARGIN_BELOW_TARGET_UNDERPRICED', skuId: 'A', reason: 'cooldown' }],
      recommended: [{ ruleCode: 'MARGIN_BELOW_TARGET_UNDERPRICED', skuId: 'A2', rank: 1 }],
    },
  },
  {
    name: 'dismissed as not relevant six weeks ago stays hidden',
    ctx: context({
      metrics: steady('B', { unitCost: 95_000n }),
      skus: [sku('B')],
      history: [{ ruleCode: 'NEGATIVE_MARGIN', skuId: 'B', isoWeek: asIsoWeek('2026-W38'), status: 'dismissed', dismissReason: 'not_relevant' }],
    }),
    expect: { dropped: [{ ruleCode: 'NEGATIVE_MARGIN', skuId: 'B', reason: 'dismissed' }], count: 0 },
  },
  {
    name: 'at most five actions, at most two of one type',
    ctx: context({
      metrics: [
        ...['N1', 'N2', 'N3', 'N4'].flatMap((id, i) => steady(id, { unitCost: 95_000n + BigInt(i) * 1000n })),
        ...['S1', 'S2', 'S3'].flatMap((id) => steady(id)),
        ...['X'].flatMap((id) => steady(id)),
      ],
      skus: [
        ...['N1', 'N2', 'N3', 'N4'].map((id) => sku(id)),
        ...['S1', 'S2', 'S3'].map((id) => sku(id, { onHand: 5, leadTimeDays: 14 })),
        sku('D1', { onHand: 80, unitCostVnd: 50_000n, firstOrderOn: asIsoDate('2026-03-01') }),
        sku('D2', { onHand: 90, unitCostVnd: 50_000n, firstOrderOn: asIsoDate('2026-03-01') }),
        sku('X'),
      ],
    }),
    expect: {
      count: 5,
      maxPerActionType: 2,
      dropped: [
        { ruleCode: 'STOCKOUT_RISK', skuId: 'S3', reason: 'per_action_type' },
        { ruleCode: 'NEGATIVE_MARGIN', skuId: 'N3', reason: 'beyond_top' },
      ],
      recommended: [{ ruleCode: 'NEGATIVE_MARGIN', skuId: 'N4', rank: 5 }],
    },
  },
  {
    name: 'one action per SKU: the higher score wins',
    ctx: context({ metrics: steady('Z', { unitCost: 95_000n }), skus: [sku('Z', { onHand: 2, leadTimeDays: 14 })] }),
    expect: {
      count: 1,
      recommended: [{ ruleCode: 'NEGATIVE_MARGIN', skuId: 'Z', rank: 1 }],
    },
  },
  {
    name: 'top sellers without a cost are listed for the cost banner and never ranked on margin',
    ctx: context({ metrics: [...steady('M', { unitCost: null, price: 300_000n }), ...steady('A', { unitCost: 80_000n })], skus: [sku('M', { unitCostVnd: null }), sku('A')], competitors: comp([['M', 500_000n]]) }),
    expect: { missingCosts: ['M'], absent: [{ ruleCode: 'MARGIN_BELOW_TARGET_UNDERPRICED', skuId: 'M' }, { ruleCode: 'NEGATIVE_MARGIN', skuId: 'M' }] },
  },
  {
    name: 'a campaign week outside the last four weeks is ignored',
    ctx: context({ metrics: steady('K', {}, { 7: { units: 25, price: 60_000n } }), skus: [sku('K')] }),
    expect: { absent: [{ ruleCode: 'CAMPAIGN_UNPROFITABLE', skuId: 'K' }] },
  },
];

