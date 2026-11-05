import { addWeeks, asIsoDate, asIsoWeek, type IsoWeek } from '@sa/shared';
import type { SkuWeekMetric } from '../metrics';
import type { RuleContext, SkuInfo } from '../rules/types';

export const WEEK = asIsoWeek('2026-W44');

export interface WeekShape {
  units?: number;
  price?: bigint;
  feesPct?: bigint;
  unitCost?: bigint | null;
  discount?: bigint;
}

export function row(skuId: string, isoWeek: IsoWeek, shape: WeekShape = {}): SkuWeekMetric {
  const units = shape.units ?? 20;
  const price = shape.price ?? 100_000n;
  const discount = shape.discount ?? 0n;
  const gross = price * BigInt(units);
  const net = gross - discount;
  const fees = (net * (shape.feesPct ?? 10n)) / 100n;
  const unitCost = shape.unitCost === undefined ? 60_000n : shape.unitCost;
  const cogs = unitCost === null ? null : unitCost * BigInt(units);
  const cm = cogs === null ? null : net - fees - cogs;
  return {
    skuId,
    isoWeek,
    units,
    orders: units,
    grossRevenueVnd: gross,
    sellerDiscountVnd: discount,
    netRevenueVnd: net,
    platformFeesVnd: fees,
    cogsVnd: cogs,
    contributionMarginVnd: cm,
    marginPct: cm === null || net === 0n ? null : Math.round((Number(cm) / Number(net)) * 1e4) / 1e4,
    avgSellingPriceVnd: units === 0 ? null : net / BigInt(units),
    avgDailyUnits28d: 0,
    onHand: null,
    stockCoverDays: null,
  };
}

/** Weeks ending at WEEK, oldest first; `shapes[i]` overrides week i counted back from WEEK (0 = WEEK). */
export function series(skuId: string, weeks: number, base: WeekShape = {}, shapes: Record<number, WeekShape> = {}): SkuWeekMetric[] {
  return Array.from({ length: weeks }, (_, i) => weeks - 1 - i).map((back) => row(skuId, addWeeks(WEEK, -back), { ...base, ...shapes[back] }));
}

export function sku(skuId: string, over: Partial<SkuInfo> = {}): SkuInfo {
  return {
    skuId,
    name: `Sản phẩm ${skuId}`,
    variation: null,
    firstOrderOn: asIsoDate('2026-01-05'),
    unitCostVnd: 60_000n,
    onHand: null,
    stockAsOf: null,
    leadTimeDays: null,
    ...over,
  };
}

export function context(over: Partial<RuleContext> & Pick<RuleContext, 'metrics' | 'skus'>): RuleContext {
  return { week: WEEK, targetMarginPct: 0.15, ...over };
}
