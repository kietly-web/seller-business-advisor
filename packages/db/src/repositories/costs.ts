import { asSkuId, type ShopId, type SkuId } from '@sa/shared';
import { sql } from 'drizzle-orm';
import type { Tx } from '../context';
import { unitCost } from '../schema';
import { appendAudit } from './audit';
import { rowsOf } from './rows';

export interface SkuCost {
  skuId: SkuId;
  skuKey: string | null;
  name: string;
  variation: string | null;
  cogsVnd: bigint | null;
  packagingVnd: bigint | null;
  effectiveFrom: string | null;
}

export async function listSkuCosts(tx: Tx, shopId: ShopId, asOf: string): Promise<SkuCost[]> {
  const rows = rowsOf<{
    id: string;
    sku_key: string | null;
    name: string;
    variation: string | null;
    cogs: string | null;
    packaging: string | null;
    effective_from: string | null;
  }>(
    await tx.execute(sql`
      select s.id, s.sku_key, s.name, s.variation, c.cogs_vnd::text as cogs, c.packaging_vnd::text as packaging,
        c.effective_from::text as effective_from
      from app.sku s
      left join lateral (
        select u.cogs_vnd, u.packaging_vnd, u.effective_from from app.unit_cost u
        where u.shop_id = s.shop_id and u.sku_id = s.id and u.effective_from <= ${asOf}::date
        order by u.effective_from desc limit 1
      ) c on true
      where s.shop_id = ${shopId} and s.active
      order by (c.cogs_vnd is null) desc, s.name, s.variation`),
  );
  return rows.map((r) => ({
    skuId: asSkuId(r.id),
    skuKey: r.sku_key,
    name: r.name,
    variation: r.variation,
    cogsVnd: r.cogs === null ? null : BigInt(r.cogs),
    packagingVnd: r.packaging === null ? null : BigInt(r.packaging),
    effectiveFrom: r.effective_from,
  }));
}

export async function setUnitCost(
  tx: Tx,
  input: { shopId: ShopId; skuId: SkuId; userId: string; cogsVnd: bigint; packagingVnd: bigint; effectiveFrom: string },
): Promise<void> {
  await tx
    .insert(unitCost)
    .values({
      shopId: input.shopId,
      skuId: input.skuId,
      cogsVnd: input.cogsVnd,
      packagingVnd: input.packagingVnd,
      effectiveFrom: input.effectiveFrom,
      source: 'inline',
      createdBy: input.userId,
    })
    .onConflictDoUpdate({
      target: [unitCost.shopId, unitCost.skuId, unitCost.effectiveFrom],
      set: { cogsVnd: input.cogsVnd, packagingVnd: input.packagingVnd, source: 'inline', createdBy: input.userId },
    });
  await appendAudit(tx, { shopId: input.shopId, actor: input.userId, action: 'cost.changed', entityId: input.skuId, meta: { source: 'inline' } });
}
