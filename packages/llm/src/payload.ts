import { z } from 'zod';
import type { ExplainInput } from './types';

// The single place that builds model input (06): aggregates and product names only, no shop or user identity
const factKey = z.string().regex(/^[a-z_]{1,40}$/);
const factValue = z.string().max(200);

const payloadCard = z.strictObject({
  ref: z.string().regex(/^r[1-9]$/),
  rule_code: z.string().regex(/^[A-Z_]{3,60}$/),
  action_type: z.string().regex(/^[a-z_]{3,40}$/),
  confidence: z.enum(['low', 'medium', 'high']),
  facts: z.record(factKey, factValue).refine((f) => Object.keys(f).length <= 20 && 'sku_name' in f, 'facts need sku_name and at most 20 keys'),
  fact_descriptions: z.record(factKey, z.string().max(200)),
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
