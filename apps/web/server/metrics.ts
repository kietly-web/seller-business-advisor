import { loadShopFacts, saveMetrics, withShopContext, type Db, type DbRole, type SaveSummary, type Tx } from '@sa/db';
import { computeMetrics } from '@sa/engine';
import { asIsoDate, asUserId, type ShopId, type SkuId } from '@sa/shared';

export async function recomputeInTx(tx: Tx, shopId: ShopId, skuIds?: readonly SkuId[]): Promise<SaveSummary> {
  const loaded = await loadShopFacts(tx, shopId, skuIds);
  const { metrics } = computeMetrics({
    lines: loaded.lines.map((l) => ({ ...l, orderedOn: asIsoDate(l.orderedOn), completedOn: l.completedOn ? asIsoDate(l.completedOn) : null })),
    fees: loaded.fees.map((f) => ({ ...f, incurredOn: asIsoDate(f.incurredOn) })),
    costs: loaded.costs.map((c) => ({ ...c, effectiveFrom: asIsoDate(c.effectiveFrom) })),
    stock: loaded.stock.map((s) => ({ ...s, asOf: asIsoDate(s.asOf) })),
  });
  const scoped = skuIds && skuIds.length > 0 ? new Set<string>(skuIds) : null;
  return saveMetrics(tx, shopId, scoped ? metrics.filter((m) => scoped.has(m.skuId)) : metrics, skuIds);
}

export function recomputeMetrics(
  db: Db,
  who: { userId?: string; shopId: ShopId; role?: DbRole },
  skuIds?: readonly SkuId[],
): Promise<SaveSummary> {
  return withShopContext(
    db,
    { role: who.role ?? 'sa_app', shopId: who.shopId, userId: who.userId ? asUserId(who.userId) : undefined },
    (tx) => recomputeInTx(tx, who.shopId, skuIds),
  );
}
