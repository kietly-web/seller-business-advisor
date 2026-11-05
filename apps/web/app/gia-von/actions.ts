'use server';

import { appDb } from '@sa/db';
import { toIctDate } from '@sa/shared';
import { revalidatePath } from 'next/cache';
import { saveCost } from '../../server/costs';
import { requireShop } from '../../server/session';

export interface CostRowState {
  status: 'idle' | 'saved' | 'invalid';
}

export async function saveCostAction(_prev: CostRowState, form: FormData): Promise<CostRowState> {
  const { user, shop } = await requireShop();
  const ok = await saveCost(appDb(), { userId: user.id, shopId: shop.id }, form, toIctDate(new Date()));
  if (ok) revalidatePath('/gia-von');
  return { status: ok ? 'saved' : 'invalid' };
}
