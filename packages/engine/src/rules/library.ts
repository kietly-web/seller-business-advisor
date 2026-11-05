import { addDays, formatPercent, formatVnd, formatVndCompact, weekEnd } from '@sa/shared';
import type { Candidate, Evidence, Facts, Rule, SkuView } from './types';

export const PRICE_RULE_MIN_UNITS_28D = 10;
export const ELASTICITY_BOUNDS_BP = [0n, 15_000n] as const;
const BP = 10_000n;

const per30 = (weekly: bigint) => (weekly * 30n) / 7n;
const share = (amount: bigint, bp: bigint) => (amount * bp) / BP;
const roundDown = (v: bigint, step: bigint) => (v / step) * step;
const count = (n: number) => String(n);

function impactFacts(low: bigint, high: bigint): Facts {
  return { impact_low: formatVndCompact(low), impact_high: formatVndCompact(high) };
}

function evidenceOf(sku: SkuView): Evidence[] {
  return sku.last4.map((m) => ({ table: 'sku_week_metric' as const, skuId: m.skuId, isoWeek: m.isoWeek }));
}

function cmPerUnit(sku: SkuView): bigint | null {
  return sku.cm28 === null || sku.units28 === 0 ? null : sku.cm28 / BigInt(sku.units28);
}

function avgPrice(sku: SkuView): bigint | null {
  return sku.units28 === 0 ? null : sku.net28 / BigInt(sku.units28);
}

function feeRateBp(sku: SkuView): bigint {
  return sku.net28 === 0n ? 0n : (sku.fees28 * BP) / sku.net28;
}

function marginPct(sku: SkuView): number | null {
  return sku.cm28 === null || sku.net28 === 0n ? null : Number(sku.cm28) / Number(sku.net28);
}

function unitsCv(sku: SkuView, ctxWeeks: number): number {
  const units = sku.last4.map((m) => m.units);
  while (units.length < ctxWeeks) units.push(0);
  const mean = units.reduce((s, u) => s + u, 0) / units.length;
  if (mean === 0) return Number.POSITIVE_INFINITY;
  const variance = units.reduce((s, u) => s + (u - mean) ** 2, 0) / units.length;
  return Math.sqrt(variance) / mean;
}

function make(rule: Rule, sku: SkuView, parts: Pick<Candidate, 'impactLowVnd' | 'impactHighVnd' | 'impactKind' | 'facts'> & { evidence?: Evidence[]; actionType?: Candidate['actionType'] }): Candidate {
  return {
    ruleCode: rule.code,
    ruleVersion: rule.version,
    actionType: parts.actionType ?? rule.actionType,
    skuId: sku.info.skuId,
    impactLowVnd: parts.impactLowVnd,
    impactHighVnd: parts.impactHighVnd,
    impactKind: parts.impactKind,
    baseConfidence: rule.baseConfidence,
    ease: rule.ease,
    cooldownWeeks: rule.cooldownWeeks,
    checklistKey: `${parts.actionType ?? rule.actionType}.v${rule.version}`,
    facts: { sku_name: sku.label, ...parts.facts },
    evidence: parts.evidence ?? evidenceOf(sku),
  };
}

// CM change over 30 days for a price move, across the elasticity bounds (05: "deliberately simple, visible")
function priceMoveImpact(sku: SkuView, from: bigint, to: bigint): [bigint, bigint] | null {
  const cogsPerUnit = sku.cogs28 === null || sku.units28 === 0 ? null : sku.cogs28 / BigInt(sku.units28);
  if (cogsPerUnit === null || from <= 0n) return null;
  const keep = BP - feeRateBp(sku);
  const cmNow = share(from, keep) - cogsPerUnit;
  const cmNew = share(to, keep) - cogsPerUnit;
  const units30 = (BigInt(sku.units28) * 30n * BP) / 28n;
  const dpBp = ((to - from) * BP) / from;
  const outcomes = ELASTICITY_BOUNDS_BP.map((e) => {
    const unitsNew = (units30 * (BP - (e * dpBp) / BP)) / BP;
    return (unitsNew * cmNew - units30 * cmNow) / BP;
  });
  return [outcomes.reduce((a, b) => (a < b ? a : b)), outcomes.reduce((a, b) => (a > b ? a : b))];
}

export const marginBelowTargetUnderpriced: Rule = {
  code: 'MARGIN_BELOW_TARGET_UNDERPRICED',
  version: 1,
  actionType: 'raise_price',
  baseConfidence: 0.6,
  ease: 0.9,
  cooldownWeeks: 2,
  needs: ['no_competitor_data'],
  evaluate(sku, shop) {
    const comp = shop.ctx.competitors?.get(sku.info.skuId);
    const margin = marginPct(sku);
    const price = avgPrice(sku);
    if (!comp || comp.listings < 2 || margin === null || price === null || sku.units28 < PRICE_RULE_MIN_UNITS_28D) return null;
    const gap = Number(price - comp.medianVnd) / Number(comp.medianVnd);
    if (margin >= shop.ctx.targetMarginPct || gap >= -0.05 || unitsCv(sku, 4) >= 0.35) return null;
    const capped = (price * 10_800n) / BP;
    const suggested = roundDown(comp.medianVnd < capped ? comp.medianVnd : capped, 1000n);
    if (suggested <= price) return null;
    const impact = priceMoveImpact(sku, price, suggested);
    if (!impact || impact[1] <= 0n) return null;
    return make(this, sku, {
      impactLowVnd: impact[0],
      impactHighVnd: impact[1],
      impactKind: 'margin',
      facts: {
        current_price: formatVnd(price),
        suggested_price: formatVnd(suggested),
        margin_pct: formatPercent(margin),
        target_margin_pct: formatPercent(shop.ctx.targetMarginPct),
        competitor_gap_pct: formatPercent(-gap),
        competitor_count: count(comp.listings),
        weeks_observed: count(sku.last4.length),
        ...impactFacts(impact[0], impact[1]),
      },
    });
  },
};

export const negativeMargin: Rule = {
  code: 'NEGATIVE_MARGIN',
  version: 1,
  actionType: 'raise_price',
  baseConfidence: 0.7,
  ease: 0.8,
  cooldownWeeks: 2,
  evaluate(sku) {
    const now = sku.current?.contributionMarginVnd;
    const before = sku.previous?.contributionMarginVnd;
    if (now === null || now === undefined || before === null || before === undefined || now >= 0n || before >= 0n) return null;
    const loss = per30(-now);
    const discount = sku.current?.sellerDiscountVnd ?? 0n;
    const evidence = [sku.previous, sku.current].flatMap((m) => (m ? [{ table: 'sku_week_metric' as const, skuId: m.skuId, isoWeek: m.isoWeek }] : []));
    return make(this, sku, {
      actionType: discount > 0n ? 'stop_discount' : 'raise_price',
      impactLowVnd: loss / 2n,
      impactHighVnd: loss,
      impactKind: 'margin',
      evidence,
      facts: {
        margin_this_week: formatVnd(now),
        margin_last_week: formatVnd(before),
        seller_discount: formatVnd(discount),
        weeks_negative: count(2),
        ...impactFacts(loss / 2n, loss),
      },
    });
  },
};

export const stockoutRisk: Rule = {
  code: 'STOCKOUT_RISK',
  version: 1,
  actionType: 'restock',
  baseConfidence: 0.65,
  ease: 0.7,
  cooldownWeeks: 1,
  needs: ['no_stock_data'],
  evaluate(sku) {
    const onHand = sku.info.onHand;
    const daily = sku.units28 / 28;
    const unitCm = cmPerUnit(sku);
    if (onHand === null || daily < 0.5 || unitCm === null || unitCm <= 0n) return null;
    const lead = sku.info.leadTimeDays ?? 7;
    const cover = onHand / daily;
    if (cover >= lead + 7) return null;
    const atRisk = BigInt(Math.round(daily * (lead + 7 - cover)));
    const high = atRisk * unitCm;
    const low = share(high, 6000n);
    const qty = Math.max(1, Math.ceil(30 * daily - onHand));
    return make(this, sku, {
      impactLowVnd: low,
      impactHighVnd: high,
      impactKind: 'margin',
      evidence: [...evidenceOf(sku), ...(sku.info.stockAsOf && sku.current ? [{ table: 'stock_snapshot' as const, skuId: sku.info.skuId, isoWeek: sku.current.isoWeek }] : [])],
      facts: {
        on_hand: count(onHand),
        days_of_stock: count(Math.floor(cover)),
        lead_time_days: count(lead),
        units_per_day: (Math.round(daily * 10) / 10).toString().replace('.', ','),
        suggested_qty: count(qty),
        ...impactFacts(low, high),
      },
    });
  },
};

export const deadStock: Rule = {
  code: 'DEAD_STOCK',
  version: 1,
  actionType: 'clearance',
  baseConfidence: 0.5,
  ease: 0.6,
  cooldownWeeks: 4,
  needs: ['no_stock_data'],
  evaluate(sku, shop) {
    const { onHand, unitCostVnd, firstOrderOn } = sku.info;
    if (!onHand || onHand <= 0 || unitCostVnd === null || sku.units28 > 0 || !firstOrderOn) return null;
    if (firstOrderOn > addDays(weekEnd(shop.ctx.week), -45)) return null;
    const value = BigInt(onHand) * unitCostVnd;
    const low = share(value, 2000n);
    const high = share(value, 5000n);
    return make(this, sku, {
      impactLowVnd: low,
      impactHighVnd: high,
      impactKind: 'cash',
      evidence: [{ table: 'stock_snapshot', skuId: sku.info.skuId, isoWeek: shop.ctx.week }],
      facts: { on_hand: count(onHand), stock_value: formatVnd(value), days_without_sales: count(28), ...impactFacts(low, high) },
    });
  },
};

export const priceAboveMarketLowConversion: Rule = {
  code: 'PRICE_ABOVE_MARKET_LOW_CONVERSION',
  version: 1,
  actionType: 'lower_price',
  baseConfidence: 0.45,
  ease: 0.9,
  cooldownWeeks: 2,
  needs: ['no_traffic_data', 'no_competitor_data'],
  evaluate(sku, shop) {
    const comp = shop.ctx.competitors?.get(sku.info.skuId);
    const traffic = shop.ctx.traffic28d?.get(sku.info.skuId);
    const price = avgPrice(sku);
    const unitCm = cmPerUnit(sku);
    const median = shop.medianConversion;
    if (!comp || comp.listings < 2 || !traffic || traffic.visitors === 0 || price === null || unitCm === null || median === null) return null;
    if (sku.units28 < PRICE_RULE_MIN_UNITS_28D) return null;
    const gap = Number(price - comp.medianVnd) / Number(comp.medianVnd);
    const conversion = traffic.orders / traffic.visitors;
    if (gap <= 0.1 || conversion >= median * 0.7) return null;
    const recovered = BigInt(Math.round(((traffic.visitors * 30) / 28) * (median - conversion)));
    const high = share(recovered * unitCm, 7000n);
    if (high <= 0n) return null;
    return make(this, sku, {
      impactLowVnd: 0n,
      impactHighVnd: high,
      impactKind: 'margin',
      facts: {
        current_price: formatVnd(price),
        competitor_median: formatVnd(comp.medianVnd),
        competitor_gap_pct: formatPercent(gap),
        competitor_count: count(comp.listings),
        conversion_pct: formatPercent(conversion),
        shop_conversion_pct: formatPercent(median),
        ...impactFacts(0n, high),
      },
    });
  },
};

export const highViewsLowConversion: Rule = {
  code: 'HIGH_VIEWS_LOW_CONVERSION',
  version: 1,
  actionType: 'improve_listing',
  baseConfidence: 0.35,
  ease: 0.5,
  cooldownWeeks: 4,
  needs: ['no_traffic_data', 'no_competitor_data'],
  evaluate(sku, shop) {
    const comp = shop.ctx.competitors?.get(sku.info.skuId);
    const traffic = shop.ctx.traffic28d?.get(sku.info.skuId);
    const price = avgPrice(sku);
    const unitCm = cmPerUnit(sku);
    const { medianConversion: median, viewsTopQuartile: topViews } = shop;
    if (!comp || comp.listings < 2 || !traffic || traffic.visitors === 0 || price === null || unitCm === null || median === null || topViews === null) return null;
    const gap = Number(price - comp.medianVnd) / Number(comp.medianVnd);
    const conversion = traffic.orders / traffic.visitors;
    if (traffic.views < topViews || conversion >= median * 0.5 || Math.abs(gap) > 0.05) return null;
    const extra = BigInt(Math.round(((traffic.visitors * 30) / 28) * (median - conversion)));
    const low = share(extra * unitCm, 1000n);
    const high = share(extra * unitCm, 4000n);
    if (high <= 0n) return null;
    return make(this, sku, {
      impactLowVnd: low,
      impactHighVnd: high,
      impactKind: 'margin',
      facts: {
        views: count(traffic.views),
        conversion_pct: formatPercent(conversion),
        shop_conversion_pct: formatPercent(median),
        ...impactFacts(low, high),
      },
    });
  },
};

export const campaignUnprofitable: Rule = {
  code: 'CAMPAIGN_UNPROFITABLE',
  version: 1,
  actionType: 'skip_campaign',
  baseConfidence: 0.55,
  ease: 0.9,
  cooldownWeeks: 4,
  needs: ['no_campaign'],
  evaluate(sku, shop) {
    const week = shop.campaignWeek;
    if (!week) return null;
    const rows = shop.ctx.metrics.filter((m) => m.skuId === sku.info.skuId);
    const during = rows.find((m) => m.isoWeek === week);
    if (!during || during.contributionMarginVnd === null || during.marginPct === null || during.marginPct >= 0 || during.units === 0) return null;
    const before = rows.filter((m) => m.isoWeek < week).slice(-4);
    const baseline = before.reduce((s, m) => s + m.units, 0) / 4;
    if (baseline > 0 && during.units >= baseline * 2) return null;
    // Only a campaign that turned a profitable SKU into a loss: a SKU losing money anyway is NEGATIVE_MARGIN's case
    if (before.length === 0 || before.some((m) => m.contributionMarginVnd === null) || before.reduce((s, m) => s + (m.contributionMarginVnd ?? 0n), 0n) < 0n) return null;
    const loss = -during.contributionMarginVnd;
    if (during.cogsVnd === null || during.avgSellingPriceVnd === null) return null;
    const breakEven = (during.cogsVnd + during.platformFeesVnd) / BigInt(during.units);
    return make(this, sku, {
      impactLowVnd: loss / 2n,
      impactHighVnd: loss,
      impactKind: 'avoided_loss',
      evidence: [{ table: 'sku_week_metric', skuId: during.skuId, isoWeek: during.isoWeek }, ...before.map((m) => ({ table: 'sku_week_metric' as const, skuId: m.skuId, isoWeek: m.isoWeek }))],
      facts: {
        campaign_margin: formatVnd(during.contributionMarginVnd),
        campaign_units: count(during.units),
        normal_units_per_week: count(Math.round(baseline)),
        campaign_price: formatVnd(during.avgSellingPriceVnd),
        break_even_price: formatVnd(breakEven),
        ...impactFacts(loss / 2n, loss),
      },
    });
  },
};

export const RULES: readonly Rule[] = [
  marginBelowTargetUnderpriced,
  negativeMargin,
  stockoutRisk,
  deadStock,
  priceAboveMarketLowConversion,
  highViewsLowConversion,
  campaignUnprofitable,
];

