import { DISMISS_REASONS, type Decision } from '@sa/db';
import { addDays, asIsoDate, parseDisplayDate, parseVnd, type IsoDate } from '@sa/shared';
import { z } from 'zod';

const uuid = z.uuid();
const COMPETITOR_URL = /^https:\/\/(shopee\.vn|s\.shopee\.vn)\/\S{1,480}$/;
const MAX_PRICE = 1_000_000_000n;

export function parseDecision(form: FormData): { recommendationId: string; decision: Decision } | null {
  const id = uuid.safeParse(form.get('recommendationId'));
  const action = String(form.get('action') ?? '');
  if (!id.success) return null;
  if (action === 'accept' || action === 'done') return { recommendationId: id.data, decision: { action } };
  if (action === 'dismiss') {
    const reason = String(form.get('reason') ?? '');
    return (DISMISS_REASONS as readonly string[]).includes(reason)
      ? { recommendationId: id.data, decision: { action: 'dismiss', reason: reason as (typeof DISMISS_REASONS)[number] } }
      : null;
  }
  return null;
}

export function parseRating(form: FormData): { recommendationId: string; rating: number } | null {
  const id = uuid.safeParse(form.get('recommendationId'));
  const rating = Number(form.get('rating'));
  return id.success && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? { recommendationId: id.data, rating } : null;
}

export type CompetitorError = 'url' | 'price' | 'date' | 'sku' | 'generic';

export function parseListing(form: FormData): { ok: true; skuId: string; url: string; label: string | null } | { ok: false; error: CompetitorError } {
  const sku = uuid.safeParse(form.get('skuId'));
  if (!sku.success) return { ok: false, error: 'sku' };
  const url = String(form.get('url') ?? '').trim();
  if (!COMPETITOR_URL.test(url)) return { ok: false, error: 'url' };
  const label = String(form.get('label') ?? '').trim().slice(0, 80);
  return { ok: true, skuId: sku.data, url, label: label === '' ? null : label };
}

// Accepts the browser's yyyy-MM-dd date input or dd/MM/yyyy; only the last 90 days, never the future
export function parseObservation(
  form: FormData,
  today: IsoDate,
): { ok: true; listingId: string; priceVnd: bigint; observedOn: IsoDate; note: string | null } | { ok: false; error: CompetitorError } {
  const listing = uuid.safeParse(form.get('listingId'));
  if (!listing.success) return { ok: false, error: 'generic' };
  const price = parseVnd(String(form.get('price') ?? '').trim());
  if (price === null || price <= 0n || price > MAX_PRICE) return { ok: false, error: 'price' };
  const rawDate = String(form.get('observedOn') ?? '').trim();
  let date: IsoDate | null = null;
  try {
    date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? asIsoDate(rawDate) : parseDisplayDate(rawDate);
  } catch {
    date = null;
  }
  if (!date || date > today || date < addDays(today, -90)) return { ok: false, error: 'date' };
  const note = String(form.get('note') ?? '').trim().slice(0, 200);
  return { ok: true, listingId: listing.data, priceVnd: price, observedOn: date, note: note === '' ? null : note };
}
