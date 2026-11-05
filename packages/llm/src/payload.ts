import { z } from 'zod';
import type { ExplainInput } from './types';

// The single place that builds model input (06): aggregates and product names only, no shop or user identity
// Allowlist: a new fact reaches the model only after it is added here, in review (06 Data protection)
export const FACT_KEYS = [
  'sku_name', 'current_price', 'suggested_price', 'margin_pct', 'target_margin_pct', 'competitor_gap_pct', 'competitor_count',
  'competitor_median', 'weeks_observed', 'impact_low', 'impact_high', 'margin_this_week', 'margin_last_week', 'seller_discount',
  'weeks_negative', 'on_hand', 'days_of_stock', 'lead_time_days', 'units_per_day', 'suggested_qty', 'stock_value',
  'days_without_sales', 'conversion_pct', 'shop_conversion_pct', 'views', 'campaign_margin', 'campaign_units',
  'normal_units_per_week', 'campaign_price', 'break_even_price',
] as const;
const factKey = z.enum(FACT_KEYS);
const factValue = z.string().max(200);

const payloadCard = z.strictObject({
  ref: z.string().regex(/^r[1-9]$/),
  rule_code: z.string().regex(/^[A-Z_]{3,60}$/),
  action_type: z.string().regex(/^[a-z_]{3,40}$/),
  confidence: z.enum(['low', 'medium', 'high']),
  facts: z.partialRecord(factKey, factValue).refine((f) => 'sku_name' in f, 'facts need sku_name'),
  fact_descriptions: z.partialRecord(factKey, z.string().max(200)),
});

export const explainPayload = z.strictObject({
  locale: z.literal('vi-VN'),
  shop_context: z.strictObject({ category: z.string().regex(/^[a-z_]{1,40}$/).nullable() }),
  recommendations: z.array(payloadCard).min(1).max(5),
});

export type ExplainPayload = z.infer<typeof explainPayload>;

const FACT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  competitor_gap_pct: 'how far the seller price is from the median competitor price, as a percentage',
  impact_low: 'low end of the estimated effect; per month unless the rule is about a campaign or stock clearance',
  impact_high: 'high end of the estimated effect',
  margin_pct: 'profit after Shopee fees and unit cost, as a share of revenue',
  break_even_price: 'price at which the product stops losing money',
  stock_value: 'unit cost of all stock on hand',
};

export function buildExplainPayload(input: ExplainInput): ExplainPayload {
  return explainPayload.parse({
    locale: 'vi-VN',
    shop_context: { category: input.category },
    recommendations: input.cards.map((c) => ({
      ref: c.ref,
      rule_code: c.ruleCode,
      action_type: c.actionType,
      confidence: c.confidence,
      facts: { ...c.facts },
      fact_descriptions: Object.fromEntries(Object.keys(c.facts).flatMap((k) => (FACT_DESCRIPTIONS[k] ? [[k, FACT_DESCRIPTIONS[k]]] : []))),
    })),
  });
}
