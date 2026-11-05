import { asIsoDate, asOrderHash } from '@sa/shared';
import { z } from 'zod';
import type { CanonicalRecord } from './types';

export const MAX_CHUNK_RECORDS = 1000;
// Next.js server actions reject bodies over 1 MB; long Vietnamese names can make 1,000 records exceed it
export const MAX_CHUNK_BYTES = 800_000;

const encoder = new TextEncoder();

export function chunkRecords(records: readonly WireRecord[]): WireRecord[][] {
  const chunks: WireRecord[][] = [];
  let current: WireRecord[] = [];
  let bytes = 2;
  for (const record of records) {
    const size = encoder.encode(JSON.stringify(record)).length + 1;
    if (current.length > 0 && (current.length >= MAX_CHUNK_RECORDS || bytes + size > MAX_CHUNK_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 2;
    }
    current.push(record);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

const money = z.string().regex(/^-?\d{1,15}$/).transform((v) => BigInt(v));
const nonNegMoney = z.string().regex(/^\d{1,15}$/).transform((v) => BigInt(v));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((v, ctx) => {
  try {
    return asIsoDate(v);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'invalid date' });
    return z.NEVER;
  }
});
const instant = z.iso.datetime();
const orderHash = z.string().regex(/^[0-9a-f]{64}$/).transform((v) => asOrderHash(v));
const sourceRow = z.number().int().min(1).max(1_000_000);
const skuKey = z.string().min(5).max(300).regex(/^(sku|name):/);
const label = z.string().min(1).max(300);

const orderLine = z.strictObject({
  kind: z.literal('order_line'),
  sourceRow,
  orderHash,
  orderStatus: z.enum(['completed', 'cancelled', 'returned', 'in_progress']),
  orderedAt: instant,
  completedAt: instant.nullable(),
  skuKey,
  itemName: label,
  variation: label.nullable(),
  sellerSku: z.string().min(1).max(100).nullable(),
  quantity: z.number().int().min(0).max(100_000),
  unitListPriceVnd: nonNegMoney,
  grossRevenueVnd: nonNegMoney,
  sellerDiscountVnd: nonNegMoney,
  platformDiscountVnd: nonNegMoney,
});

const feeLine = z.strictObject({
  kind: z.literal('fee_line'),
  sourceRow,
  orderHash,
  feeType: z.enum(['commission', 'transaction', 'service', 'shipping_seller', 'affiliate', 'ads', 'other']),
  amountVnd: money,
  incurredOn: isoDate,
});

const unitCost = z.strictObject({
  kind: z.literal('unit_cost'),
  sourceRow,
  skuKey,
  cogsVnd: nonNegMoney,
  packagingVnd: nonNegMoney,
  effectiveFrom: isoDate,
});

const stock = z.strictObject({
  kind: z.literal('stock'),
  sourceRow,
  skuKey,
  asOf: isoDate,
  onHand: z.number().int().min(0).max(10_000_000),
  leadTimeDays: z.number().int().min(0).max(365).nullable(),
});

export const wireRecord = z.discriminatedUnion('kind', [orderLine, feeLine, unitCost, stock]);

export type WireRecord = z.input<typeof wireRecord>;

export const wireChunk = z.array(wireRecord).min(1).max(MAX_CHUNK_RECORDS);

export function toWire(record: CanonicalRecord): WireRecord {
  return JSON.parse(JSON.stringify(record, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))) as WireRecord;
}

export function fromWire(records: unknown): CanonicalRecord[] {
  return wireChunk.parse(records) as CanonicalRecord[];
}

const PHONE = /(?:\+84|\b84|\b0)(?:[\s.-]?\d){9}\b/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

// Last net (04-ingestion-parser.md): a parser bug, never normal input, puts a phone or email in a text field
export function looksLikePii(value: string): boolean {
  return PHONE.test(value) || EMAIL.test(value);
}

const NAME_FIELDS = ['itemName', 'variation'] as const;
// Seller SKU codes are often 10 digits starting with 0, so codes get the email check only
const CODE_FIELDS = ['skuKey', 'sellerSku'] as const;

export function recordHasPii(record: CanonicalRecord): boolean {
  const field = (f: string) => (record as unknown as Record<string, unknown>)[f];
  return (
    NAME_FIELDS.some((f) => { const v = field(f); return typeof v === 'string' && looksLikePii(v); }) ||
    CODE_FIELDS.some((f) => { const v = field(f); return typeof v === 'string' && EMAIL.test(v); })
  );
}
