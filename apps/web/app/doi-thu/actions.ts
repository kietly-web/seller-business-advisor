'use server';

import { addCompetitorListing, addCompetitorObservation, appDb, withShopContext, type Tx } from '@sa/db';
import { asUserId, toIctDate } from '@sa/shared';
import { revalidatePath } from 'next/cache';
import { parseListing, parseObservation, type CompetitorError } from '../../server/forms';
import { requireShop } from '../../server/session';

export interface CompetitorFormState {
  status: 'idle' | 'saved' | 'error';
  error?: CompetitorError;
}

// requireShop stays outside the try: its redirect is thrown and must not be swallowed.
// A foreign-key or RLS failure (another shop's SKU or listing id) surfaces as a generic error, never details.
async function saveInShop(fn: (tx: Tx, ids: { shopId: Awaited<ReturnType<typeof requireShop>>['shop']['id']; userId: string }) => Promise<unknown>): Promise<CompetitorFormState> {
  const { user, shop } = await requireShop();
  try {
    await withShopContext(appDb(), { role: 'sa_app', shopId: shop.id, userId: asUserId(user.id) }, (tx) => fn(tx, { shopId: shop.id, userId: user.id }));
  } catch (error) {
    console.error(`[competitors] save failed: ${error instanceof Error ? error.constructor.name : 'unknown'}`);
    return { status: 'error', error: 'generic' };
  }
  revalidatePath('/doi-thu');
  return { status: 'saved' };
}

export async function addListingAction(_prev: CompetitorFormState, form: FormData): Promise<CompetitorFormState> {
  const parsed = parseListing(form);
  if (!parsed.ok) return { status: 'error', error: parsed.error };
  return saveInShop((tx, { shopId, userId }) => addCompetitorListing(tx, { shopId, userId, skuId: parsed.skuId, url: parsed.url, label: parsed.label }));
}

export async function addObservationAction(_prev: CompetitorFormState, form: FormData): Promise<CompetitorFormState> {
  const parsed = parseObservation(form, toIctDate(new Date()));
  if (!parsed.ok) return { status: 'error', error: parsed.error };
  return saveInShop((tx, { shopId, userId }) =>
    addCompetitorObservation(tx, { shopId, userId, listingId: parsed.listingId, priceVnd: parsed.priceVnd, observedOn: parsed.observedOn, note: parsed.note }),
  );
}
