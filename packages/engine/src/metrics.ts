import { addDays, isoWeekOf, weekEnd, type IsoDate, type IsoWeek } from '@sa/shared';

export type LineStatus = 'completed' | 'cancelled' | 'returned' | 'in_progress';

export interface LineFact {
  lineId: string;
  orderHash: string;
  skuId: string;
  status: LineStatus;
  orderedOn: IsoDate;
  completedOn: IsoDate | null;
  quantity: number;
  grossRevenueVnd: bigint;
  sellerDiscountVnd: bigint;
}

export interface FeeFact {
  orderHash: string;
  skuId: string | null;
  amountVnd: bigint;
  incurredOn: IsoDate;
}

export interface CostFact {
  skuId: string;
  effectiveFrom: IsoDate;
  cogsVnd: bigint;
  packagingVnd: bigint;
}

export interface StockFact {
  skuId: string;
  asOf: IsoDate;
  onHand: number;
}

export interface ShopFacts {
  lines: readonly LineFact[];
  fees: readonly FeeFact[];
  costs: readonly CostFact[];
  stock: readonly StockFact[];
}

export interface SkuWeekMetric {
  skuId: string;
  isoWeek: IsoWeek;
  units: number;
  orders: number;
  grossRevenueVnd: bigint;
  sellerDiscountVnd: bigint;
  netRevenueVnd: bigint;
  platformFeesVnd: bigint;
  cogsVnd: bigint | null;
  contributionMarginVnd: bigint | null;
  marginPct: number | null;
  avgSellingPriceVnd: bigint | null;
  avgDailyUnits28d: number;
  onHand: number | null;
  stockCoverDays: number | null;
}

export interface UnallocatedFees {
  isoWeek: IsoWeek;
  amountVnd: bigint;
}

export interface MetricsResult {
  metrics: SkuWeekMetric[];
  unallocatedFees: UnallocatedFees[];
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

function divRound(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return 2n * (r < 0n ? -r : r) >= (b < 0n ? -b : b) ? q + (a < 0n === b < 0n ? 1n : -1n) : q;
}

// Shares by weight; rounding residue goes to the heaviest line so the parts sum to the whole
export function allocate(amount: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) return [];
  const total = weights.reduce((s, w) => s + w, 0n);
  const shares = total === 0n ? weights.map(() => amount / BigInt(weights.length)) : weights.map((w) => (amount * w) / total);
  const residue = amount - shares.reduce((s, x) => s + x, 0n);
  let heaviest = 0;
  weights.forEach((w, i) => {
    if (w > (weights[heaviest] ?? 0n)) heaviest = i;
  });
  shares[heaviest] = (shares[heaviest] ?? 0n) + residue;
  return shares;
}

interface LineAcc {
  line: LineFact & { completedOn: IsoDate };
  discount: bigint;
  fees: bigint;
}

function costLookup(costs: readonly CostFact[]) {
  const bySku = new Map<string, CostFact[]>();
  for (const c of costs) {
    const list = bySku.get(c.skuId) ?? [];
    list.push(c);
    bySku.set(c.skuId, list);
  }
  for (const list of bySku.values()) list.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  // The earliest cost also covers older orders: sellers enter today's cost and expect it to apply to history
  return (skuId: string, on: IsoDate): bigint | null => {
    const list = bySku.get(skuId);
    if (!list || list.length === 0) return null;
    let chosen = list[0] as CostFact;
    for (const c of list) {
      if (c.effectiveFrom <= on) chosen = c;
      else break;
    }
    return chosen.cogsVnd + chosen.packagingVnd;
  };
}

export function computeMetrics(facts: ShopFacts): MetricsResult {
  const completed = facts.lines.filter((l): l is LineFact & { completedOn: IsoDate } => l.status === 'completed' && l.completedOn !== null);
  const byOrder = new Map<string, LineAcc[]>();
  for (const line of completed) {
    const list = byOrder.get(line.orderHash) ?? [];
    list.push({ line, discount: 0n, fees: 0n });
    byOrder.set(line.orderHash, list);
  }

  for (const accs of byOrder.values()) {
    const discount = accs.reduce((s, a) => s + a.line.sellerDiscountVnd, 0n);
    allocate(discount, accs.map((a) => a.line.grossRevenueVnd)).forEach((d, i) => {
      (accs[i] as LineAcc).discount = d;
    });
  }

  const unallocated = new Map<IsoWeek, bigint>();
  for (const fee of facts.fees) {
    const accs = (byOrder.get(fee.orderHash) ?? []).filter((a) => fee.skuId === null || a.line.skuId === fee.skuId);
    if (accs.length === 0) {
      const week = isoWeekOf(fee.incurredOn);
      unallocated.set(week, (unallocated.get(week) ?? 0n) + fee.amountVnd);
      continue;
    }
    allocate(fee.amountVnd, accs.map((a) => a.line.grossRevenueVnd)).forEach((f, i) => {
      (accs[i] as LineAcc).fees += f;
    });
  }

  const costOf = costLookup(facts.costs);
  const dailyUnits = new Map<string, Map<IsoDate, number>>();
  const groups = new Map<string, LineAcc[]>();
  for (const accs of byOrder.values()) {
    for (const acc of accs) {
      const key = `${acc.line.skuId}|${isoWeekOf(acc.line.completedOn)}`;
      const list = groups.get(key) ?? [];
      list.push(acc);
      groups.set(key, list);
      const days = dailyUnits.get(acc.line.skuId) ?? new Map<IsoDate, number>();
      days.set(acc.line.completedOn, (days.get(acc.line.completedOn) ?? 0) + acc.line.quantity);
      dailyUnits.set(acc.line.skuId, days);
    }
  }

  const stockBySku = new Map<string, StockFact[]>();
  for (const s of [...facts.stock].sort((a, b) => (a.asOf < b.asOf ? -1 : 1))) {
    const list = stockBySku.get(s.skuId) ?? [];
    list.push(s);
    stockBySku.set(s.skuId, list);
  }

  const metrics: SkuWeekMetric[] = [];
  for (const [key, accs] of groups) {
    const [skuId = '', week = ''] = key.split('|');
    const isoWeek = week as IsoWeek;
    const units = accs.reduce((s, a) => s + a.line.quantity, 0);
    const gross = accs.reduce((s, a) => s + a.line.grossRevenueVnd, 0n);
    const discount = accs.reduce((s, a) => s + a.discount, 0n);
    const fees = accs.reduce((s, a) => s + a.fees, 0n);
    const net = gross - discount;
    let cogs: bigint | null = 0n;
    for (const a of accs) {
      const unit = costOf(skuId, a.line.orderedOn);
      if (unit === null) {
        cogs = null;
        break;
      }
      cogs += unit * BigInt(a.line.quantity);
    }
    const cm = cogs === null ? null : net - fees - cogs;
    const end = weekEnd(isoWeek);
    const avgDaily = trailingUnits(dailyUnits.get(skuId), end) / 28;
    const onHand = latestOnHand(stockBySku.get(skuId), end);
    metrics.push({
      skuId,
      isoWeek,
      units,
      orders: new Set(accs.map((a) => a.line.orderHash)).size,
      grossRevenueVnd: gross,
      sellerDiscountVnd: discount,
      netRevenueVnd: net,
      platformFeesVnd: fees,
      cogsVnd: cogs,
      contributionMarginVnd: cm,
      marginPct: cm === null || net === 0n ? null : round4(Number(cm) / Number(net)),
      avgSellingPriceVnd: units === 0 ? null : divRound(net, BigInt(units)),
      avgDailyUnits28d: round4(avgDaily),
      onHand,
      stockCoverDays: onHand === null ? null : avgDaily === 0 ? Number.POSITIVE_INFINITY : Math.round((onHand / avgDaily) * 100) / 100,
    });
  }
  metrics.sort((a, b) => (a.isoWeek === b.isoWeek ? (a.skuId < b.skuId ? -1 : 1) : a.isoWeek < b.isoWeek ? -1 : 1));
  return {
    metrics,
    unallocatedFees: [...unallocated].sort(([a], [b]) => (a < b ? -1 : 1)).map(([isoWeek, amountVnd]) => ({ isoWeek, amountVnd })),
  };
}

export function computeWeekMetrics(facts: ShopFacts, week: IsoWeek): SkuWeekMetric[] {
  return computeMetrics(facts).metrics.filter((m) => m.isoWeek === week);
}

function trailingUnits(days: ReadonlyMap<IsoDate, number> | undefined, end: IsoDate): number {
  if (!days) return 0;
  let total = 0;
  for (let i = 0; i < 28; i++) total += days.get(addDays(end, -i)) ?? 0;
  return total;
}

function latestOnHand(snapshots: readonly StockFact[] | undefined, end: IsoDate): number | null {
  let found: number | null = null;
  for (const s of snapshots ?? []) {
    if (s.asOf <= end) found = s.onHand;
    else break;
  }
  return found;
}
