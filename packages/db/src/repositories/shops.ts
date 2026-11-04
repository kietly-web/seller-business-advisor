import { asShopId, type ShopId } from '@sa/shared';
import { eq, sql } from 'drizzle-orm';
import type { Tx } from '../context';
import { shop } from '../schema';
import { rowsOf } from './rows';

export interface ShopSummary {
  id: ShopId;
  name: string;
  category: string | null;
  isDemo: boolean;
}

export async function listMyShops(tx: Tx): Promise<ShopSummary[]> {
  const rows = await tx
    .select({ id: shop.id, name: shop.name, category: shop.category, isDemo: shop.isDemo })
    .from(shop)
    .orderBy(shop.createdAt);
  return rows.map((r) => ({ ...r, id: asShopId(r.id) }));
}

export async function createShop(
  tx: Tx,
  input: { name: string; category: string | null; isDemo: boolean },
): Promise<ShopId> {
  const result = await tx.execute(
    sql`select app_ctx.create_shop(${input.name}, ${input.category}, ${input.isDemo}) as id`,
  );
  const id = rowsOf<{ id: string }>(result)[0]?.id;
  if (!id) {
    throw new Error('create_shop returned no id');
  }
  return asShopId(id);
}

export async function renameShop(tx: Tx, shopId: ShopId, name: string): Promise<void> {
  await tx.update(shop).set({ name }).where(eq(shop.id, shopId));
}
