import { listMetricWeeks, readSkuWeek, readUnallocatedFees, readWeekProfit, withShopContext, type Db, type SkuWeekDetail, type WeekProfitRow } from '@sa/db';
import { asIsoWeek, asSkuId, asUserId, ictIsoWeekOf, weekEnd, weekStart, type IsoDate, type IsoWeek, type ShopId } from '@sa/shared';

interface Who {
  userId: string;
  shopId: ShopId;
}

export interface WeekTotals {
  units: number;
  netRevenueVnd: bigint;
  platformFeesVnd: bigint;
  costedNetRevenueVnd: bigint;
  cogsVnd: bigint;
  contributionMarginVnd: bigint;
  marginPct: number | null;
  missingCost: number;
}

export interface WeekProfit {
  weeks: IsoWeek[];
  week: IsoWeek | null;
  rows: WeekProfitRow[];
  totals: WeekTotals;
  unallocatedFeesVnd: bigint;
}

const inShop = <T>(db: Db, who: Who, fn: Parameters<typeof withShopContext<T>>[2]) =>
  withShopContext(db, { role: 'sa_app', shopId: who.shopId, userId: asUserId(who.userId) }, fn);

export function parseWeek(value: unknown): IsoWeek | null {
  if (typeof value !== 'string') return null;
  try {
    return asIsoWeek(value);
  } catch {
    return null;
  }
}

// Default to the latest finished week: the current week is still filling up
export function pickWeek(weeks: readonly IsoWeek[], requested: IsoWeek | null, today: Date): IsoWeek | null {
  if (requested && weeks.includes(requested)) return requested;
  const current = ictIsoWeekOf(today);
  return weeks.find((w) => w < current) ?? weeks[0] ?? null;
}

export function totalsOf(rows: readonly WeekProfitRow[]): WeekTotals {
  const t: WeekTotals = { units: 0, netRevenueVnd: 0n, platformFeesVnd: 0n, costedNetRevenueVnd: 0n, cogsVnd: 0n, contributionMarginVnd: 0n, marginPct: null, missingCost: 0 };
  for (const r of rows) {
    t.units += r.units;
    t.netRevenueVnd += r.netRevenueVnd;
    t.platformFeesVnd += r.platformFeesVnd;
    if (r.cogsVnd === null || r.contributionMarginVnd === null) {
      t.missingCost++;
    } else {
      t.costedNetRevenueVnd += r.netRevenueVnd;
      t.cogsVnd += r.cogsVnd;
      t.contributionMarginVnd += r.contributionMarginVnd;
    }
  }
  t.marginPct = t.costedNetRevenueVnd === 0n ? null : Math.round((Number(t.contributionMarginVnd) / Number(t.costedNetRevenueVnd)) * 1e4) / 1e4;
  return t;
}

export async function weekProfit(db: Db, who: Who, requested: unknown, today: Date): Promise<WeekProfit> {
  return inShop(db, who, async (tx) => {
    const weeks = (await listMetricWeeks(tx, who.shopId)).map((w) => asIsoWeek(w));
    const week = pickWeek(weeks, parseWeek(requested), today);
    if (!week) {
      return { weeks, week, rows: [], totals: totalsOf([]), unallocatedFeesVnd: 0n };
    }
    const rows = await readWeekProfit(tx, who.shopId, week);
    const unallocatedFeesVnd = await readUnallocatedFees(tx, who.shopId, weekStart(week), weekEnd(week));
    return { weeks, week, rows, totals: totalsOf(rows), unallocatedFeesVnd };
  });
}

export async function skuWeekDetail(db: Db, who: Who, skuIdInput: string, weekInput: unknown): Promise<{ week: IsoWeek; detail: SkuWeekDetail } | null> {
  const week = parseWeek(weekInput);
  if (!week || !/^[0-9a-f-]{36}$/.test(skuIdInput)) return null;
  const skuId = asSkuId(skuIdInput);
  const detail = await inShop(db, who, (tx) => readSkuWeek(tx, who.shopId, skuId, week, weekStart(week), weekEnd(week)));
  return detail ? { week, detail } : null;
}

export function weekRange(week: IsoWeek): { from: IsoDate; to: IsoDate; n: number } {
  return { from: weekStart(week), to: weekEnd(week), n: Number(week.slice(6)) };
}
