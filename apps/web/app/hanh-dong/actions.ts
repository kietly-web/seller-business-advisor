'use server';

import { appDb, decideRecommendation, rateRecommendation, withShopContext } from '@sa/db';
import { asUserId } from '@sa/shared';
import { revalidatePath } from 'next/cache';
import { parseDecision, parseRating } from '../../server/forms';
import { explainForShop } from '../../server/llm';
import { requireShop } from '../../server/session';
import { runRecommendations } from '../../server/weekly-run';

export interface RefreshState {
  status: 'idle' | 'done' | 'rate_limited';
}

async function shopTx() {
  const { user, shop } = await requireShop();
  const db = appDb();
  const inShop = <T,>(fn: Parameters<typeof withShopContext<T>>[2]) => withShopContext(db, { role: 'sa_app', shopId: shop.id, userId: asUserId(user.id) }, fn);
  return { user, shop, db, inShop };
}

export async function refreshAction(): Promise<RefreshState> {
  const { shop, db, inShop } = await shopTx();
  const outcome = await runRecommendations(inShop, shop.id, { trigger: 'on_demand', now: new Date(), explain: explainForShop(db, shop.id) });
  revalidatePath('/hanh-dong');
  return { status: outcome.ok ? 'done' : 'rate_limited' };
}

export async function decideAction(form: FormData): Promise<void> {
  const parsed = parseDecision(form);
  if (!parsed) return;
  const { user, shop, inShop } = await shopTx();
  await inShop((tx) => decideRecommendation(tx, { shopId: shop.id, userId: user.id, ...parsed }));
  revalidatePath('/hanh-dong');
}

export async function rateAction(form: FormData): Promise<void> {
  const parsed = parseRating(form);
  if (!parsed) return;
  const { user, shop, inShop } = await shopTx();
  await inShop((tx) => rateRecommendation(tx, { shopId: shop.id, userId: user.id, ...parsed }));
  revalidatePath('/hanh-dong');
}
