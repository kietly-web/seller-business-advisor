import { asIsoDate } from '@sa/shared';
import { describe, expect, it } from 'vitest';
import { parseDecision, parseListing, parseObservation, parseRating } from './forms';

const id = '00000000-0000-4000-8000-000000000001';
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const TODAY = asIsoDate('2026-11-05');

describe('decision and rating forms', () => {
  it('accepts known actions and reasons only', () => {
    expect(parseDecision(form({ recommendationId: id, action: 'accept' }))).toEqual({ recommendationId: id, decision: { action: 'accept' } });
    expect(parseDecision(form({ recommendationId: id, action: 'dismiss', reason: 'not_relevant' }))?.decision).toEqual({ action: 'dismiss', reason: 'not_relevant' });
    expect(parseDecision(form({ recommendationId: id, action: 'dismiss', reason: 'x' }))).toBeNull();
    expect(parseDecision(form({ recommendationId: id, action: 'delete' }))).toBeNull();
    expect(parseDecision(form({ recommendationId: 'x', action: 'accept' }))).toBeNull();
    expect(parseRating(form({ recommendationId: id, rating: '5' }))).toEqual({ recommendationId: id, rating: 5 });
    expect(parseRating(form({ recommendationId: id, rating: '6' }))).toBeNull();
  });
});

describe('competitor forms', () => {
  it('accepts only shopee.vn links', () => {
    expect(parseListing(form({ skuId: id, url: 'https://shopee.vn/ke-gia-vi-i.1.2', label: ' Shop A ' }))).toEqual({
      ok: true, skuId: id, url: 'https://shopee.vn/ke-gia-vi-i.1.2', label: 'Shop A',
    });
    for (const url of ['http://shopee.vn/x', 'https://shopee.vn.evil.com/x', 'https://lazada.vn/x', 'javascript:alert(1)', 'https://shopee.vn/a b']) {
      expect(parseListing(form({ skuId: id, url }))).toEqual({ ok: false, error: 'url' });
    }
  });

  it('accepts prices in ₫ and recent past dates only', () => {
    expect(parseObservation(form({ listingId: id, price: '189.000', observedOn: '2026-11-01' }), TODAY)).toMatchObject({ ok: true, priceVnd: 189_000n, observedOn: '2026-11-01' });
    expect(parseObservation(form({ listingId: id, price: '189.000', observedOn: '01/11/2026' }), TODAY)).toMatchObject({ ok: true });
    expect(parseObservation(form({ listingId: id, price: '0', observedOn: '2026-11-01' }), TODAY)).toEqual({ ok: false, error: 'price' });
    expect(parseObservation(form({ listingId: id, price: '189.000', observedOn: '2026-11-06' }), TODAY)).toEqual({ ok: false, error: 'date' });
    expect(parseObservation(form({ listingId: id, price: '189.000', observedOn: '2026-07-01' }), TODAY)).toEqual({ ok: false, error: 'date' });
    expect(parseObservation(form({ listingId: id, price: '189.000', observedOn: '2026-02-30' }), TODAY)).toEqual({ ok: false, error: 'date' });
  });
});
