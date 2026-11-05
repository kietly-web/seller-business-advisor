import { type ShopId } from '@sa/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../context';
import { recommendation, recommendationRun, shop } from '../schema';
import { appendAudit } from './audit';
import { rowsOf } from './rows';

const ict = (column: string) => sql.raw(`(((${column}) at time zone 'UTC') + interval '7 hours')::date`);

export interface RuleInputs {
  targetMarginPct: number;
  category: string | null;
  metrics: {
    skuId: string; isoWeek: string; units: number; orders: number; grossRevenueVnd: bigint; sellerDiscountVnd: bigint;
    netRevenueVnd: bigint; platformFeesVnd: bigint; cogsVnd: bigint | null; contributionMarginVnd: bigint | null;
    marginPct: number | null; avgSellingPriceVnd: bigint | null; onHand: number | null;
  }[];
  skus: {
    skuId: string; name: string; variation: string | null; firstOrderOn: string | null; unitCostVnd: bigint | null;
    onHand: number | null; stockAsOf: string | null; leadTimeDays: number | null;
  }[];
  history: { ruleCode: string; skuId: string | null; isoWeek: string; status: string; dismissReason: string | null }[];
  learned: { shopScoped: boolean; ruleCode: string; alpha: number; beta: number }[];
  competitorPrices: { skuId: string; listingId: string; priceVnd: bigint; observedOn: string }[];
}

const big = (v: string | null) => (v === null ? null : BigInt(v));

export async function loadRuleInputs(
  tx: Tx,
  shopId: ShopId,
  input: { week: string; weekEnd: string; stockAsOf: string; historyFromWeek: string; competitorFrom: string },
): Promise<RuleInputs> {
  const [shopRow] = await tx.select({ settings: shop.settings, category: shop.category }).from(shop).where(eq(shop.id, shopId));
  const target = (shopRow?.settings as { targetMarginPct?: number } | undefined)?.targetMarginPct;

  const metrics = rowsOf<{
    sku_id: string; iso_week: string; units: number; orders: number; gross: string; discount: string; net: string; fees: string;
    cogs: string | null; cm: string | null; margin: string | null; asp: string | null; on_hand: number | null;
  }>(
    await tx.execute(sql`
      select sku_id, iso_week, units, orders, gross_revenue_vnd::text as gross, seller_discount_vnd::text as discount,
        net_revenue_vnd::text as net, platform_fees_vnd::text as fees, cogs_vnd::text as cogs,
        contribution_margin_vnd::text as cm, margin_pct::text as margin, avg_selling_price_vnd::text as asp, on_hand
      from app.sku_week_metric where shop_id = ${shopId} and iso_week <= ${input.week}`),
  );

  // Cost effective at the week's end, or the earliest cost for SKUs whose costs all start later (05: cost backfill)
  const skus = rowsOf<{
    id: string; name: string; variation: string | null; first_order_on: string | null; unit_cost: string | null;
    on_hand: number | null; as_of: string | null; lead_time_days: number | null;
  }>(
    await tx.execute(sql`
      select s.id, s.name, s.variation,
        (select min(${ict('o.ordered_at')})::text from app.order_line o where o.shop_id = s.shop_id and o.sku_id = s.id) as first_order_on,
        c.unit_cost, st.on_hand, st.as_of, st.lead_time_days
      from app.sku s
      left join lateral (
        select (u.cogs_vnd + u.packaging_vnd)::text as unit_cost from app.unit_cost u
        where u.shop_id = s.shop_id and u.sku_id = s.id
        order by (u.effective_from <= ${input.weekEnd}::date) desc,
          case when u.effective_from <= ${input.weekEnd}::date then u.effective_from end desc nulls last, u.effective_from
        limit 1
      ) c on true
      left join lateral (
        select x.on_hand, x.as_of::text as as_of, x.lead_time_days from app.stock_snapshot x
        where x.shop_id = s.shop_id and x.sku_id = s.id and x.as_of <= ${input.stockAsOf}::date
        order by x.as_of desc limit 1
      ) st on true
      where s.shop_id = ${shopId} and s.active`),
  );

  const history = rowsOf<{ rule_code: string; sku_id: string | null; iso_week: string; status: string; dismiss_reason: string | null }>(
    await tx.execute(sql`
      select r.rule_code, r.sku_id, run.iso_week, r.status, r.dismiss_reason
      from app.recommendation r
      join app.recommendation_run run on run.shop_id = r.shop_id and run.id = r.run_id
      where r.shop_id = ${shopId} and run.iso_week >= ${input.historyFromWeek} and run.iso_week < ${input.week}`),
  );

  const learned = rowsOf<{ shop_id: string | null; rule_code: string; alpha: string; beta: string }>(
    await tx.execute(sql`
      select shop_id, rule_code, alpha::text as alpha, beta::text as beta from app.rule_track_record
      where shop_id = ${shopId} or shop_id is null`),
  );

  const competitorPrices = rowsOf<{ sku_id: string; listing_id: string; price: string; observed_on: string }>(
    await tx.execute(sql`
      select distinct on (o.listing_id) l.sku_id, o.listing_id, o.price_vnd::text as price, o.observed_on::text as observed_on
      from app.competitor_observation o
      join app.competitor_listing l on l.shop_id = o.shop_id and l.id = o.listing_id
      where o.shop_id = ${shopId} and o.observed_on between ${input.competitorFrom}::date and ${input.weekEnd}::date
      order by o.listing_id, o.observed_on desc`),
  );

  return {
    targetMarginPct: typeof target === 'number' ? target / 100 : 0.15,
    category: shopRow?.category ?? null,
    metrics: metrics.map((m) => ({
      skuId: m.sku_id, isoWeek: m.iso_week, units: m.units, orders: m.orders, grossRevenueVnd: BigInt(m.gross),
      sellerDiscountVnd: BigInt(m.discount), netRevenueVnd: BigInt(m.net), platformFeesVnd: BigInt(m.fees), cogsVnd: big(m.cogs),
      contributionMarginVnd: big(m.cm), marginPct: m.margin === null ? null : Number(m.margin), avgSellingPriceVnd: big(m.asp), onHand: m.on_hand,
    })),
    skus: skus.map((s) => ({
      skuId: s.id, name: s.name, variation: s.variation, firstOrderOn: s.first_order_on, unitCostVnd: big(s.unit_cost),
      onHand: s.on_hand, stockAsOf: s.as_of, leadTimeDays: s.lead_time_days,
    })),
    history: history.map((h) => ({ ruleCode: h.rule_code, skuId: h.sku_id, isoWeek: h.iso_week, status: h.status, dismissReason: h.dismiss_reason })),
    learned: learned.map((l) => ({ shopScoped: l.shop_id !== null, ruleCode: l.rule_code, alpha: Number(l.alpha), beta: Number(l.beta) })),
    competitorPrices: competitorPrices.map((c) => ({ skuId: c.sku_id, listingId: c.listing_id, priceVnd: BigInt(c.price), observedOn: c.observed_on })),
  };
}

export interface NewRecommendation {
  skuId: string | null;
  ruleCode: string;
  ruleVersion: number;
  actionType: string;
  rank: number;
  score: number;
  impactLowVnd: bigint;
  impactHighVnd: bigint;
  confidence: 'low' | 'medium' | 'high';
  confidenceValue: number;
  facts: Record<string, string>;
  evidence: unknown[];
  textVi: { title: string; body: string; why_now: string; checklist: readonly string[]; impact_kind: string };
  textSource: 'llm' | 'template';
}

export type ReserveResult = { reserved: true; runId: string } | { reserved: false; reason: 'rate_limited' | 'already_ran' };

/**
 * Serialises runs per shop (advisory lock), checks the limits and inserts a `running` row before any model call,
 * so parallel requests and failed attempts both count toward the on-demand limit.
 */
export async function reserveRun(
  tx: Tx,
  input: { shopId: ShopId; isoWeek: string; trigger: 'weekly' | 'on_demand'; engineVersion: string; onDemandSince: Date; onDemandLimit: number },
): Promise<ReserveResult> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`recommendation_run:${input.shopId}`}))`);
  if (input.trigger === 'on_demand' && (await countOnDemandRunsSince(tx, input.shopId, input.onDemandSince)) >= input.onDemandLimit) {
    return { reserved: false, reason: 'rate_limited' };
  }
  if (input.trigger === 'weekly') {
    const [existing] = await tx
      .select({ id: recommendationRun.id })
      .from(recommendationRun)
      .where(and(eq(recommendationRun.shopId, input.shopId), eq(recommendationRun.trigger, 'weekly'), eq(recommendationRun.isoWeek, input.isoWeek)))
      .limit(1);
    if (existing) return { reserved: false, reason: 'already_ran' };
  }
  const [created] = await tx
    .insert(recommendationRun)
    .values({ shopId: input.shopId, isoWeek: input.isoWeek, trigger: input.trigger, status: 'running', engineVersion: input.engineVersion })
    .returning({ id: recommendationRun.id });
  if (!created) throw new Error('Run could not be reserved');
  return { reserved: true, runId: created.id };
}

export interface FinishedRun {
  shopId: ShopId;
  runId: string;
  status: 'succeeded' | 'insufficient_data';
  llmModel: string | null;
  llmFallbackUsed: boolean | null;
  notes: Record<string, unknown>;
  recommendations: readonly NewRecommendation[];
}

// A new run replaces the cards still on screen: older unanswered cards expire
export async function finishRun(tx: Tx, run: FinishedRun): Promise<void> {
  await tx
    .update(recommendation)
    .set({ status: 'expired' })
    .where(and(eq(recommendation.shopId, run.shopId), eq(recommendation.status, 'shown')));
  await tx
    .update(recommendationRun)
    .set({ status: run.status, llmModel: run.llmModel, llmFallbackUsed: run.llmFallbackUsed, notes: run.notes, finishedAt: sql`now()` })
    .where(and(eq(recommendationRun.shopId, run.shopId), eq(recommendationRun.id, run.runId)));
  if (run.recommendations.length > 0) {
    await tx.insert(recommendation).values(
      run.recommendations.map((r) => ({
        shopId: run.shopId,
        runId: run.runId,
        skuId: r.skuId,
        ruleCode: r.ruleCode,
        ruleVersion: r.ruleVersion,
        actionType: r.actionType,
        rank: r.rank,
        score: String(r.score),
        impactLowVnd: r.impactLowVnd,
        impactHighVnd: r.impactHighVnd,
        confidence: r.confidence,
        confidenceValue: r.confidenceValue.toFixed(4),
        facts: r.facts,
        evidence: r.evidence,
        textVi: r.textVi,
        textSource: r.textSource,
      })),
    );
  }
}

export async function failRun(tx: Tx, shopId: ShopId, runId: string): Promise<void> {
  await tx
    .update(recommendationRun)
    .set({ status: 'failed', finishedAt: sql`now()` })
    .where(and(eq(recommendationRun.shopId, shopId), eq(recommendationRun.id, runId)));
}

export async function countOnDemandRunsSince(tx: Tx, shopId: ShopId, since: Date): Promise<number> {
  const [row] = rowsOf<{ n: number }>(
    await tx.execute(sql`
      select count(*)::int as n from app.recommendation_run
      where shop_id = ${shopId} and trigger = 'on_demand' and started_at >= ${since.toISOString()}::timestamptz`),
  );
  return row?.n ?? 0;
}

export interface RunCard {
  id: string;
  skuId: string | null;
  skuName: string | null;
  ruleCode: string;
  actionType: string;
  rank: number;
  impactLowVnd: bigint;
  impactHighVnd: bigint;
  confidence: 'low' | 'medium' | 'high';
  facts: Record<string, string>;
  evidence: { table: string; skuId: string; isoWeek: string }[];
  textVi: NewRecommendation['textVi'];
  textSource: 'llm' | 'template';
  status: 'shown' | 'accepted' | 'dismissed' | 'done' | 'expired';
  dismissReason: string | null;
  rating: number | null;
}

export interface LatestRun {
  id: string;
  isoWeek: string;
  trigger: string;
  status: string;
  notes: Record<string, unknown>;
  finishedAt: Date | null;
  cards: RunCard[];
}

export async function latestRun(tx: Tx, shopId: ShopId): Promise<LatestRun | null> {
  const [run] = await tx
    .select()
    .from(recommendationRun)
    .where(and(eq(recommendationRun.shopId, shopId), inArray(recommendationRun.status, ['succeeded', 'insufficient_data'])))
    .orderBy(desc(recommendationRun.startedAt))
    .limit(1);
  if (!run) return null;
  const cards = rowsOf<{
    id: string; sku_id: string | null; name: string | null; variation: string | null; rule_code: string; action_type: string;
    rank: number; low: string; high: string; confidence: RunCard['confidence']; facts: Record<string, string>;
    evidence: RunCard['evidence']; text_vi: RunCard['textVi']; text_source: RunCard['textSource']; status: RunCard['status'];
    dismiss_reason: string | null; rating: number | null;
  }>(
    await tx.execute(sql`
      select r.id, r.sku_id, s.name, s.variation, r.rule_code, r.action_type, r.rank, r.impact_low_vnd::text as low,
        r.impact_high_vnd::text as high, r.confidence, r.facts, r.evidence, r.text_vi, r.text_source, r.status, r.dismiss_reason, r.rating
      from app.recommendation r
      left join app.sku s on s.shop_id = r.shop_id and s.id = r.sku_id
      where r.shop_id = ${shopId} and r.run_id = ${run.id}
      order by r.rank`),
  );
  return {
    id: run.id,
    isoWeek: run.isoWeek,
    trigger: run.trigger,
    status: run.status,
    notes: (run.notes ?? {}) as Record<string, unknown>,
    finishedAt: run.finishedAt,
    cards: cards.map((c) => ({
      id: c.id, skuId: c.sku_id, skuName: c.name === null ? null : c.variation ? `${c.name} - ${c.variation}` : c.name,
      ruleCode: c.rule_code, actionType: c.action_type, rank: c.rank, impactLowVnd: BigInt(c.low), impactHighVnd: BigInt(c.high),
      confidence: c.confidence, facts: c.facts, evidence: c.evidence, textVi: c.text_vi, textSource: c.text_source,
      status: c.status, dismissReason: c.dismiss_reason, rating: c.rating,
    })),
  };
}

export const DISMISS_REASONS = ['not_relevant', 'already_done', 'disagree', 'cannot_do', 'other'] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];
export type Decision = { action: 'accept' } | { action: 'done' } | { action: 'dismiss'; reason: DismissReason };

const FROM: Record<Decision['action'], readonly string[]> = {
  accept: ['shown'],
  done: ['shown', 'accepted'],
  dismiss: ['shown', 'accepted'],
};

/** Returns false when the card is missing or its current status doesn't allow the move. */
export async function decideRecommendation(tx: Tx, input: { shopId: ShopId; recommendationId: string; userId: string; decision: Decision }): Promise<boolean> {
  const d = input.decision;
  const now = sql`now()`;
  const updated = await tx
    .update(recommendation)
    .set(
      d.action === 'accept'
        ? { status: 'accepted', decidedAt: now }
        : d.action === 'done'
          ? { status: 'done', doneAt: now, decidedAt: sql`coalesce(${recommendation.decidedAt}, now())` }
          : { status: 'dismissed', dismissReason: d.reason, decidedAt: now },
    )
    .where(
      and(
        eq(recommendation.shopId, input.shopId),
        eq(recommendation.id, input.recommendationId),
        inArray(recommendation.status, [...FROM[d.action]]),
      ),
    )
    .returning({ id: recommendation.id });
  if (updated.length === 0) return false;
  await appendAudit(tx, {
    shopId: input.shopId,
    actor: input.userId,
    action: d.action === 'accept' ? 'recommendation.accepted' : d.action === 'done' ? 'recommendation.done' : 'recommendation.dismissed',
    entityId: input.recommendationId,
    meta: d.action === 'dismiss' ? { reason: d.reason } : {},
  });
  return true;
}

export async function rateRecommendation(tx: Tx, input: { shopId: ShopId; recommendationId: string; userId: string; rating: number }): Promise<boolean> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return false;
  const updated = await tx
    .update(recommendation)
    .set({ rating: input.rating })
    .where(and(eq(recommendation.shopId, input.shopId), eq(recommendation.id, input.recommendationId), sql`${recommendation.status} <> 'expired'`))
    .returning({ id: recommendation.id });
  if (updated.length === 0) return false;
  await appendAudit(tx, { shopId: input.shopId, actor: input.userId, action: 'recommendation.rated', entityId: input.recommendationId, meta: { rating: input.rating } });
  return true;
}
