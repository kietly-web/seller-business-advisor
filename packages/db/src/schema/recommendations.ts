import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { app, fraction, id, tstz, vnd } from './columns';
import { sku } from './catalogue';
import { shop } from './tenancy';

export const skuWeekMetric = app.table(
  'sku_week_metric',
  {
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    skuId: uuid('sku_id')
      .notNull()
      .references(() => sku.id, { onDelete: 'cascade' }),
    isoWeek: text('iso_week').notNull(),
    units: integer('units').notNull(),
    orders: integer('orders').notNull(),
    grossRevenueVnd: vnd('gross_revenue_vnd').notNull(),
    sellerDiscountVnd: vnd('seller_discount_vnd').notNull(),
    netRevenueVnd: vnd('net_revenue_vnd').notNull(),
    platformFeesVnd: vnd('platform_fees_vnd').notNull(),
    cogsVnd: vnd('cogs_vnd'),
    contributionMarginVnd: vnd('contribution_margin_vnd'),
    marginPct: fraction('margin_pct'),
    avgSellingPriceVnd: vnd('avg_selling_price_vnd'),
    views: integer('views'),
    visitors: integer('visitors'),
    conversionPct: fraction('conversion_pct'),
    onHand: integer('on_hand'),
    stockCoverDays: numeric('stock_cover_days', { precision: 8, scale: 2 }),
    competitorMedianVnd: vnd('competitor_median_vnd'),
    priceGapPct: fraction('price_gap_pct'),
    inputsHash: text('inputs_hash').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.shopId, t.skuId, t.isoWeek] }),
    check('sku_week_metric_week_check', sql`${t.isoWeek} ~ '^[0-9]{4}-W[0-9]{2}$'`),
  ],
);

export const recommendationRun = app.table(
  'recommendation_run',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    isoWeek: text('iso_week').notNull(),
    trigger: text('trigger').notNull(),
    status: text('status').notNull(),
    engineVersion: text('engine_version').notNull(),
    llmModel: text('llm_model'),
    llmFallbackUsed: boolean('llm_fallback_used'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: tstz('finished_at'),
  },
  (t) => [
    check('recommendation_run_trigger_check', sql`${t.trigger} in ('weekly', 'on_demand')`),
    check(
      'recommendation_run_status_check',
      sql`${t.status} in ('running', 'succeeded', 'insufficient_data', 'failed')`,
    ),
  ],
);

export const recommendation = app.table(
  'recommendation',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    runId: uuid('run_id')
      .notNull()
      .references(() => recommendationRun.id, { onDelete: 'cascade' }),
    skuId: uuid('sku_id').references(() => sku.id, { onDelete: 'cascade' }),
    ruleCode: text('rule_code').notNull(),
    ruleVersion: integer('rule_version').notNull(),
    actionType: text('action_type').notNull(),
    rank: smallint('rank').notNull(),
    score: numeric('score').notNull(),
    impactLowVnd: vnd('impact_low_vnd').notNull(),
    impactHighVnd: vnd('impact_high_vnd').notNull(),
    confidence: text('confidence').notNull(),
    confidenceValue: numeric('confidence_value', { precision: 5, scale: 4 }).notNull(),
    facts: jsonb('facts').notNull(),
    evidence: jsonb('evidence').notNull(),
    textVi: jsonb('text_vi').notNull(),
    textSource: text('text_source').notNull(),
    status: text('status').notNull().default('shown'),
    dismissReason: text('dismiss_reason'),
    decidedAt: tstz('decided_at'),
    doneAt: tstz('done_at'),
    rating: smallint('rating'),
  },
  (t) => [
    index('recommendation_shop_run_idx').on(t.shopId, t.runId),
    check('recommendation_rank_check', sql`${t.rank} between 1 and 5`),
    check('recommendation_confidence_check', sql`${t.confidence} in ('low', 'medium', 'high')`),
    check('recommendation_text_source_check', sql`${t.textSource} in ('llm', 'template')`),
    check(
      'recommendation_status_check',
      sql`${t.status} in ('shown', 'accepted', 'dismissed', 'done', 'expired')`,
    ),
    check('recommendation_rating_check', sql`${t.rating} between 1 and 5`),
  ],
);

export const outcome = app.table(
  'outcome',
  {
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => recommendation.id, { onDelete: 'cascade' }),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    horizonDays: smallint('horizon_days').notNull(),
    baseline: jsonb('baseline').notNull(),
    observed: jsonb('observed').notNull(),
    deltaUnitsPerDay: numeric('delta_units_per_day'),
    deltaMarginVndPerDay: numeric('delta_margin_vnd_per_day'),
    result: text('result').notNull(),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.recommendationId, t.horizonDays] }),
    check('outcome_horizon_check', sql`${t.horizonDays} in (7, 14)`),
    check(
      'outcome_result_check',
      sql`${t.result} in ('positive', 'neutral', 'negative', 'insufficient_data')`,
    ),
  ],
);

export const ruleTrackRecord = app.table(
  'rule_track_record',
  {
    shopId: uuid('shop_id').references(() => shop.id, { onDelete: 'cascade' }),
    ruleCode: text('rule_code').notNull(),
    alpha: numeric('alpha').notNull().default('1'),
    beta: numeric('beta').notNull().default('1'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('rule_track_record_shop_rule_unique').on(t.shopId, t.ruleCode).nullsNotDistinct()],
);
