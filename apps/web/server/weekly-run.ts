import { countOnDemandRunsSince, loadRuleInputs, saveRun, type NewRecommendation, type RuleInputs, type Tx } from '@sa/db';
import {
  CHECKLISTS,
  competitorMedian,
  ENGINE_VERSION,
  planRecommendations,
  renderCard,
  type CompetitorPrice,
  type History,
  type Plan,
  type RuleCode,
  type RuleContext,
  type RuleStats,
} from '@sa/engine';
import type { ExplainInput, ExplainResult } from '@sa/llm';
import { addDays, addWeeks, asIsoDate, asIsoWeek, ictIsoWeekOf, toIctDate, weekEnd, type IsoWeek, type ShopId } from '@sa/shared';

export const ON_DEMAND_RUNS_PER_DAY = 3;
const DAY_MS = 86_400_000;

export type InShop = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
export type Explain = (input: ExplainInput) => Promise<ExplainResult>;

export type RunOutcome =
  | { ok: true; runId: string; status: 'succeeded' | 'insufficient_data'; cards: number }
  | { ok: false; error: 'rate_limited' };

// Recommendations look at the last finished week; the current one is still filling up
export function runWeek(now: Date): IsoWeek {
  return addWeeks(ictIsoWeekOf(now), -1);
}

export function contextFrom(inputs: RuleInputs, week: IsoWeek): RuleContext {
  const byGroup = (shopScoped: boolean) =>
    Object.fromEntries(inputs.learned.filter((l) => l.shopScoped === shopScoped).map((l) => [l.ruleCode, { alpha: l.alpha, beta: l.beta }])) as Partial<
      Record<RuleCode, RuleStats>
    >;
  const pricesBySku = new Map<string, bigint[]>();
  for (const p of inputs.competitorPrices) pricesBySku.set(p.skuId, [...(pricesBySku.get(p.skuId) ?? []), p.priceVnd]);
  const competitors = new Map<string, CompetitorPrice>();
  for (const [skuId, prices] of pricesBySku) {
    const median = competitorMedian(prices);
    if (median) competitors.set(skuId, median);
  }
  return {
    week,
    targetMarginPct: inputs.targetMarginPct,
    metrics: inputs.metrics.map((m) => ({ ...m, isoWeek: asIsoWeek(m.isoWeek), avgDailyUnits28d: 0, stockCoverDays: null })),
    skus: inputs.skus.map((s) => ({
      ...s,
      firstOrderOn: s.firstOrderOn ? asIsoDate(s.firstOrderOn) : null,
      stockAsOf: s.stockAsOf ? asIsoDate(s.stockAsOf) : null,
    })),
    history: inputs.history.map((h) => ({ ...h, isoWeek: asIsoWeek(h.isoWeek), status: h.status as History['status'] })),
    learned: { shop: byGroup(true), global: byGroup(false) },
    competitors,
  };
}

function notesOf(plan: Plan, inputs: RuleInputs) {
  const names = new Map(inputs.skus.map((s) => [s.skuId, s.variation ? `${s.name} - ${s.variation}` : s.name]));
  return {
    weeksOfHistory: plan.weeksOfHistory,
    skipped: [...new Set(plan.skipped.map((s) => s.reason))],
    missingCosts: plan.missingCosts.map((m) => ({ skuId: m.skuId, skuName: names.get(m.skuId) ?? m.facts.sku_name })),
  };
}

export async function runRecommendations(
  inShop: InShop,
  shopId: ShopId,
  options: { trigger: 'weekly' | 'on_demand'; now: Date; explain: Explain },
): Promise<RunOutcome> {
  const week = runWeek(options.now);
  const end = weekEnd(week);
  const loaded = await inShop(async (tx) => {
    if (options.trigger === 'on_demand') {
      const recent = await countOnDemandRunsSince(tx, shopId, new Date(options.now.getTime() - DAY_MS));
      if (recent >= ON_DEMAND_RUNS_PER_DAY) return null;
    }
    return loadRuleInputs(tx, shopId, {
      week,
      weekEnd: end,
      // Stock is what the seller has now, not at the end of the week being analysed
      stockAsOf: toIctDate(options.now),
      historyFromWeek: addWeeks(week, -8),
      competitorFrom: addDays(end, -13),
    });
  });
  if (!loaded) return { ok: false, error: 'rate_limited' };

  const plan = planRecommendations(contextFrom(loaded, week));
  const cards = plan.recommendations.map((r, i) => ({
    ref: `r${i + 1}`,
    ruleCode: r.ruleCode,
    actionType: r.actionType,
    confidence: r.confidence,
    facts: r.facts,
    fallback: renderCard(r.ruleCode, r.facts),
  }));
  // The model is called outside any transaction so a slow API call never holds a database connection
  const explained = cards.length > 0 ? await options.explain({ category: loaded.category, cards }) : null;

  const recommendations: NewRecommendation[] = plan.recommendations.map((r, i) => {
    const text = explained?.cards.find((c) => c.ref === `r${i + 1}`);
    const card = text?.text ?? renderCard(r.ruleCode, r.facts);
    return {
      skuId: r.skuId,
      ruleCode: r.ruleCode,
      ruleVersion: r.ruleVersion,
      actionType: r.actionType,
      rank: r.rank,
      score: r.score,
      impactLowVnd: r.impactLowVnd,
      impactHighVnd: r.impactHighVnd,
      confidence: r.confidence,
      confidenceValue: r.confidenceValue,
      facts: r.facts,
      evidence: r.evidence,
      textVi: { ...card, checklist: CHECKLISTS[r.checklistKey as keyof typeof CHECKLISTS] ?? [], impact_kind: r.impactKind },
      textSource: text?.source ?? 'template',
    };
  });
  const status = plan.status === 'insufficient_data' ? 'insufficient_data' : 'succeeded';
  const runId = await inShop((tx) =>
    saveRun(tx, {
      shopId,
      isoWeek: week,
      trigger: options.trigger,
      status,
      engineVersion: ENGINE_VERSION,
      llmModel: explained?.call?.model ?? null,
      llmFallbackUsed: explained ? explained.cards.some((c) => c.source === 'template') : null,
      notes: { ...notesOf(plan, loaded), promptVersion: explained?.call?.promptVersion ?? null },
      recommendations,
    }),
  );
  return { ok: true, runId, status, cards: recommendations.length };
}
