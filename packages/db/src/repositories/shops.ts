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

export class ShopAlreadyExistsError extends Error {
  constructor() {
    super('User already owns a shop');
  }
}

export async function createShop(
  tx: Tx,
  input: { name: string; category: string | null; isDemo: boolean; settings?: ShopSettings },
): Promise<ShopId> {
  let result: unknown;
  try {
    result = await tx.execute(
      sql`select app_ctx.create_shop(${input.name}, ${input.category}, ${input.isDemo}, ${JSON.stringify(input.settings ?? {})}::jsonb) as id`,
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ShopAlreadyExistsError();
    }
    throw error;
  }
  const id = rowsOf<{ id: string }>(result)[0]?.id;
  if (!id) {
    throw new Error('create_shop returned no id');
  }
  return asShopId(id);
}

export async function renameShop(tx: Tx, shopId: ShopId, name: string): Promise<void> {
  await tx.update(shop).set({ name }).where(eq(shop.id, shopId));
}

export interface ShopSettings {
  targetMarginPct?: number;
}

export async function updateShopSettings(tx: Tx, shopId: ShopId, settings: ShopSettings): Promise<void> {
  await tx
    .update(shop)
    .set({ settings: sql`${shop.settings} || ${JSON.stringify(settings)}::jsonb` })
    .where(eq(shop.id, shopId));
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: string }).code === '23505') {
      return true;
    }
  }
  return false;
}
