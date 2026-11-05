import type { IsoDate, IsoWeek } from '@sa/shared';
import type { SkuWeekMetric } from '../metrics';

export type ActionType = 'raise_price' | 'lower_price' | 'restock' | 'clearance' | 'improve_listing' | 'stop_discount' | 'skip_campaign';

export type RuleCode =
  | 'MARGIN_BELOW_TARGET_UNDERPRICED'
  | 'NEGATIVE_MARGIN'
  | 'STOCKOUT_RISK'
  | 'DEAD_STOCK'
  | 'PRICE_ABOVE_MARKET_LOW_CONVERSION'
  | 'HIGH_VIEWS_LOW_CONVERSION'
  | 'CAMPAIGN_UNPROFITABLE';

export interface SkuInfo {
  skuId: string;
  name: string;
  variation: string | null;
  firstOrderOn: IsoDate | null;
  unitCostVnd: bigint | null;
  onHand: number | null;
  stockAsOf: IsoDate | null;
  leadTimeDays: number | null;
}

export interface CompetitorPrice {
  medianVnd: bigint;
  listings: number;
}

export interface Traffic {
  views: number;
  visitors: number;
  orders: number;
}

export interface History {
  ruleCode: string;
  skuId: string | null;
  isoWeek: IsoWeek;
  status: 'shown' | 'accepted' | 'dismissed' | 'done' | 'expired';
  dismissReason: string | null;
}

export interface RuleStats {
  alpha: number;
  beta: number;
}

export interface RuleContext {
  week: IsoWeek;
  metrics: readonly SkuWeekMetric[];
  skus: readonly SkuInfo[];
  targetMarginPct: number;
  competitors?: ReadonlyMap<string, CompetitorPrice>;
  traffic28d?: ReadonlyMap<string, Traffic>;
  history?: readonly History[];
  learned?: { shop: Readonly<Partial<Record<RuleCode, RuleStats>>>; global: Readonly<Partial<Record<RuleCode, RuleStats>>> };
}

export interface Evidence {
  table: 'sku_week_metric' | 'stock_snapshot';
  skuId: string;
  isoWeek: IsoWeek;
}

export type Facts = Record<string, string>;

export interface Candidate {
  ruleCode: RuleCode;
  ruleVersion: number;
  actionType: ActionType;
  skuId: string;
  impactLowVnd: bigint;
  impactHighVnd: bigint;
  impactKind: 'margin' | 'cash' | 'avoided_loss';
  baseConfidence: number;
  ease: number;
  cooldownWeeks: number;
  checklistKey: string;
  facts: Facts;
  evidence: Evidence[];
}

export type SkipReason = 'no_stock_data' | 'no_traffic_data' | 'no_competitor_data' | 'no_campaign';

export interface Rule {
  code: RuleCode;
  version: number;
  actionType: ActionType;
  baseConfidence: number;
  ease: number;
  cooldownWeeks: number;
  checklistKey: string;
  needs?: readonly SkipReason[];
  evaluate(sku: SkuView, ctx: ShopView): Candidate | null;
}

export interface SkuView {
  info: SkuInfo;
  label: string;
  current: SkuWeekMetric | null;
  previous: SkuWeekMetric | null;
  last4: readonly SkuWeekMetric[];
  units28: number;
  net28: bigint;
  fees28: bigint;
  cogs28: bigint | null;
  cm28: bigint | null;
}

export interface ShopView {
  ctx: RuleContext;
  campaignWeek: IsoWeek | null;
  medianConversion: number | null;
  viewsTopQuartile: number | null;
}
