import { addDays, addWeeks, daysBetween, weekStart, type IsoWeek } from '@sa/shared';
import { RULES } from './rules/library';
import type { Candidate, RuleCode, RuleContext, ShopView, SkipReason, SkuView } from './rules/types';

export const MIN_WEEKS_OF_HISTORY = 4;
export const MAX_RECOMMENDATIONS = 5;
export const MAX_PER_ACTION_TYPE = 2;
export const NOT_RELEVANT_COOLDOWN_WEEKS = 8;
export const COST_MISSING_TOP_N = 20;

export type ConfidenceLabel = 'high' | 'medium' | 'low';
export type DropReason = 'cooldown' | 'dismissed' | 'per_sku' | 'per_action_type' | 'beyond_top';

export interface ScoredCandidate extends Candidate {
  dataQuality: number;
  learned: number;
  confidenceValue: number;
  confidence: ConfidenceLabel;
  score: number;
  dropped: DropReason | null;
}

export interface RankedCandidate extends ScoredCandidate {
  rank: number;
}

export interface MissingCost {
  skuId: string;
  facts: { sku_name: string };
  netRevenue28dVnd: bigint;
}

export interface Plan {
  status: 'ok' | 'insufficient_data';
  weeksOfHistory: number;
  recommendations: RankedCandidate[];
  scored: ScoredCandidate[];
  skipped: { ruleCode: RuleCode; reason: SkipReason }[];
  missingCosts: MissingCost[];
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const weeksApart = (a: IsoWeek, b: IsoWeek) => Math.round(daysBetween(weekStart(a), weekStart(b)) / 7);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
}

// Mega-sale days (1.1 … 12.12) mark campaign weeks
function hasDoubleDay(week: IsoWeek): boolean {
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart(week), i);
    if (day.slice(5, 7) === day.slice(8, 10)) return true;
  }
  return false;
}

export function buildViews(ctx: RuleContext): { skus: SkuView[]; shop: ShopView; weeksOfHistory: number } {
  const from = addWeeks(ctx.week, -3);
  const bySku = new Map<string, RuleContext['metrics'][number][]>();
  let earliest: IsoWeek | null = null;
  for (const m of ctx.metrics) {
    if (m.isoWeek > ctx.week) continue;
    if (!earliest || m.isoWeek < earliest) earliest = m.isoWeek;
    const list = bySku.get(m.skuId) ?? [];
    list.push(m);
    bySku.set(m.skuId, list);
  }
  const skus = ctx.skus.map((info): SkuView => {
    const rows = (bySku.get(info.skuId) ?? []).sort((a, b) => (a.isoWeek < b.isoWeek ? -1 : 1));
    const last4 = rows.filter((m) => m.isoWeek >= from);
    const costed = last4.every((m) => m.cogsVnd !== null);
    return {
      info,
      label: info.variation ? `${info.name} - ${info.variation}` : info.name,
      current: rows.find((m) => m.isoWeek === ctx.week) ?? null,
      previous: rows.find((m) => m.isoWeek === addWeeks(ctx.week, -1)) ?? null,
      last4,
      units28: last4.reduce((s, m) => s + m.units, 0),
      net28: last4.reduce((s, m) => s + m.netRevenueVnd, 0n),
      fees28: last4.reduce((s, m) => s + m.platformFeesVnd, 0n),
      cogs28: costed ? last4.reduce((s, m) => s + (m.cogsVnd ?? 0n), 0n) : null,
      cm28: costed ? last4.reduce((s, m) => s + (m.contributionMarginVnd ?? 0n), 0n) : null,
    };
  });
  const traffic = [...(ctx.traffic28d?.values() ?? [])];
  const conversions = traffic.filter((t) => t.visitors > 0).map((t) => t.orders / t.visitors);
  let campaignWeek: IsoWeek | null = null;
  for (let i = 0; i < 4 && !campaignWeek; i++) {
    const w = addWeeks(ctx.week, -i);
    if (hasDoubleDay(w)) campaignWeek = w;
  }
  return {
    skus,
    shop: { ctx, campaignWeek, medianConversion: median(conversions), viewsTopQuartile: quantile(traffic.map((t) => t.views), 0.75) },
    weeksOfHistory: earliest ? weeksApart(earliest, ctx.week) + 1 : 0,
  };
}

function skipReasons(skus: readonly SkuView[], shop: ShopView): Set<SkipReason> {
  const reasons = new Set<SkipReason>();
  if (!skus.some((s) => s.info.onHand !== null)) reasons.add('no_stock_data');
  if (!shop.ctx.traffic28d || shop.ctx.traffic28d.size === 0) reasons.add('no_traffic_data');
  if (![...(shop.ctx.competitors?.values() ?? [])].some((c) => c.listings >= 2)) reasons.add('no_competitor_data');
  if (!shop.campaignWeek) reasons.add('no_campaign');
  return reasons;
}

export function evaluateRules(ctx: RuleContext): { candidates: Candidate[]; skipped: Plan['skipped']; views: ReturnType<typeof buildViews> } {
  const views = buildViews(ctx);
  const missing = skipReasons(views.skus, views.shop);
  const candidates: Candidate[] = [];
  const skipped: Plan['skipped'] = [];
  for (const rule of RULES) {
    const blocker = rule.needs?.find((n) => missing.has(n));
    if (blocker) {
      skipped.push({ ruleCode: rule.code, reason: blocker });
      continue;
    }
    for (const sku of views.skus) {
      const c = rule.evaluate(sku, views.shop);
      if (c && c.impactHighVnd > 0n) candidates.push(c);
    }
  }
  return { candidates, skipped, views };
}

function learnedFactor(ctx: RuleContext, code: RuleCode): number {
  const g = ctx.learned?.global[code] ?? { alpha: 1, beta: 1 };
  const s = ctx.learned?.shop[code] ?? { alpha: 0, beta: 0 };
  const prior = g.alpha / (g.alpha + g.beta);
  const posterior = (g.alpha + s.alpha) / (g.alpha + g.beta + s.alpha + s.beta);
  return clamp(posterior / prior, 0.5, 1.5);
}

function labelOf(value: number): ConfidenceLabel {
  return value >= 0.65 ? 'high' : value >= 0.45 ? 'medium' : 'low';
}

export function rank(candidates: readonly Candidate[], ctx: RuleContext, views: ReturnType<typeof buildViews>): { ranked: RankedCandidate[]; scored: ScoredCandidate[] } {
  const skuViews = new Map(views.skus.map((s) => [s.info.skuId, s]));
  const shopNet = views.skus.reduce((s, v) => s + v.net28, 0n);
  const costedNet = views.skus.reduce((s, v) => s + (v.cogs28 === null ? 0n : v.net28), 0n);
  const coverage = shopNet === 0n ? 0 : Number(costedNet) / Number(shopNet);
  const history = Math.min(views.weeksOfHistory, 12) / 12;

  const scored: ScoredCandidate[] = candidates.map((c) => {
    const sample = Math.min(1, (skuViews.get(c.skuId)?.units28 ?? 0) / 30);
    const dataQuality = round4(0.5 + 0.5 * ((history + coverage + sample) / 3));
    const learned = round4(learnedFactor(ctx, c.ruleCode));
    const confidenceValue = round4(clamp(c.baseConfidence * dataQuality * learned, 0, 1));
    const midpoint = Number(c.impactLowVnd + c.impactHighVnd) / 2;
    return { ...c, dataQuality, learned, confidenceValue, confidence: labelOf(confidenceValue), score: Math.round(midpoint * confidenceValue * c.ease), dropped: null };
  });
  scored.sort((a, b) => b.score - a.score || a.ruleCode.localeCompare(b.ruleCode) || a.skuId.localeCompare(b.skuId));

  const seenSku = new Set<string>();
  const perAction = new Map<string, number>();
  const ranked: RankedCandidate[] = [];
  for (const c of scored) {
    const past = (ctx.history ?? []).filter((h) => h.ruleCode === c.ruleCode && h.skuId === c.skuId);
    const ago = (w: IsoWeek) => weeksApart(w, ctx.week);
    if (past.some((h) => h.status === 'dismissed' && h.dismissReason === 'not_relevant' && ago(h.isoWeek) >= 0 && ago(h.isoWeek) <= NOT_RELEVANT_COOLDOWN_WEEKS)) {
      c.dropped = 'dismissed';
    } else if (past.some((h) => ago(h.isoWeek) >= 1 && ago(h.isoWeek) <= c.cooldownWeeks)) {
      c.dropped = 'cooldown';
    } else if (seenSku.has(c.skuId)) {
      c.dropped = 'per_sku';
    } else if ((perAction.get(c.actionType) ?? 0) >= MAX_PER_ACTION_TYPE) {
      c.dropped = 'per_action_type';
    } else if (ranked.length >= MAX_RECOMMENDATIONS) {
      c.dropped = 'beyond_top';
    } else {
      seenSku.add(c.skuId);
      perAction.set(c.actionType, (perAction.get(c.actionType) ?? 0) + 1);
      ranked.push({ ...c, rank: ranked.length + 1 });
    }
  }
  return { ranked, scored };
}

export function planRecommendations(ctx: RuleContext): Plan {
  const { candidates, skipped, views } = evaluateRules(ctx);
  const missingCosts = views.skus
    .filter((s) => s.net28 > 0n)
    .sort((a, b) => (b.net28 > a.net28 ? 1 : b.net28 < a.net28 ? -1 : a.info.skuId.localeCompare(b.info.skuId)))
    .slice(0, COST_MISSING_TOP_N)
    .filter((s) => s.cogs28 === null)
    .map((s) => ({ skuId: s.info.skuId, facts: { sku_name: s.label }, netRevenue28dVnd: s.net28 }));
  if (views.weeksOfHistory < MIN_WEEKS_OF_HISTORY) {
    return { status: 'insufficient_data', weeksOfHistory: views.weeksOfHistory, recommendations: [], scored: [], skipped, missingCosts };
  }
  const { ranked, scored } = rank(candidates, ctx, views);
  return { status: 'ok', weeksOfHistory: views.weeksOfHistory, recommendations: ranked, scored, skipped, missingCosts };
}
