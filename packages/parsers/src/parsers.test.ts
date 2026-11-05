import { readFileSync } from 'node:fs';
import { asIsoDate } from '@sa/shared';
import { describe, expect, it } from 'vitest';
import { readCsv, type Table } from './csv';
import { detect } from './detect';
import { createOrderHasher } from './hash';
import { REGISTRY, sellerUnitCostsV1, shopeeOrdersV1 } from './index';
import { prepare, transform } from './pipeline';
import { FAKE_BUYER, generateShop, incomeExport, ordersExport, stockFile, unitCostsFile } from './synthetic';
import type { CanonicalRecord, OrderLineRecord } from './types';

const TODAY = asIsoDate('2026-11-05');
const SALT = new Uint8Array(32).fill(42);

function serialise(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
}

async function parse(table: Table) {
  const detection = detect(REGISTRY, table);
  if (detection.kind !== 'match') {
    throw new Error(`expected a match, got ${detection.kind}`);
  }
  const prepared = prepare(detection.candidate, table);
  const result = await transform(prepared, table, { hashOrderId: createOrderHasher(SALT), today: TODAY });
  return { prepared, ...result };
}

const sum = (records: CanonicalRecord[], pick: (r: CanonicalRecord) => bigint) => records.reduce((s, r) => s + pick(r), 0n);

describe('synthetic shop round trip', () => {
  const shop = generateShop({ days: 60, products: 10, ordersPerDay: 8 });

  it('orders export: detected, every line kept, buyer columns removed and flagged', async () => {
    const { prepared, records, issues } = await parse(ordersExport(shop));
    expect(prepared.parser.id).toBe('shopee.orders@v1');
    const lines = shop.orders.flatMap((o) => o.lines);
    expect(records).toHaveLength(lines.length);
    expect(issues).toEqual([]);
    expect(sum(records, (r) => (r as OrderLineRecord).grossRevenueVnd)).toBe(
      lines.reduce((s, l) => s + l.sku.dealPriceVnd * BigInt(l.quantity), 0n),
    );
    const pii = prepared.removedColumns.filter((c) => c.pii).map((c) => c.name);
    expect(pii).toEqual(expect.arrayContaining(['Người mua', 'Tên người nhận', 'Số điện thoại', 'Địa chỉ nhận hàng', 'Mã vận đơn']));
    expect(prepared.unmappedHeaders).toEqual([]);
  });

  it('income export: header found under title rows, fees reconcile', async () => {
    const { prepared, records } = await parse(incomeExport(shop));
    expect(prepared.parser.id).toBe('shopee.income@v1');
    expect(prepared.headerRow).toBe(2);
    const expected = shop.orders.reduce(
      (s, o) => s + o.fees.fixed + o.fees.service + o.fees.payment + o.fees.shippingSeller + o.fees.affiliate,
      0n,
    );
    expect(sum(records, (r) => (r.kind === 'fee_line' ? r.amountVnd : 0n))).toBe(expected);
  });

  it('order hashes join across orders and income exports', async () => {
    const orders = new Set((await parse(ordersExport(shop))).records.map((r) => (r as OrderLineRecord).orderHash));
    const income = (await parse(incomeExport(shop))).records.map((r) => (r.kind === 'fee_line' ? r.orderHash : ''));
    expect(income.every((h) => orders.has(h as OrderLineRecord['orderHash']))).toBe(true);
  });

  it('unit costs: blank costs are flagged, the rest kept', async () => {
    const { prepared, records, issues } = await parse(unitCostsFile(shop, asIsoDate('2026-01-01')));
    expect(prepared.parser.id).toBe('seller.unit_costs@v1');
    const missing = shop.skus.filter((s) => s.cogsVnd === null).length;
    expect(records).toHaveLength(shop.skus.length - missing);
    expect(issues.filter((i) => i.code === 'COST_MISSING')).toHaveLength(missing);
  });

  it('stock file', async () => {
    const { prepared, records } = await parse(stockFile(shop, asIsoDate('2026-01-01')));
    expect(prepared.parser.id).toBe('seller.stock@v1');
    expect(records).toHaveLength(shop.skus.length);
  });

  it('serialised output never contains buyer values or raw order IDs', async () => {
    const tables = [ordersExport(shop), incomeExport(shop)];
    const out = serialise(await Promise.all(tables.map(parse)));
    for (const value of Object.values(FAKE_BUYER)) {
      expect(out).not.toContain(value);
    }
    for (const o of shop.orders) {
      expect(out).not.toContain(o.orderId);
    }
  });
});

describe('shopee.orders@v1 edge-case fixture', () => {
  const table = readCsv(readFileSync(new URL('../fixtures/shopee.orders@v1/edge-cases.csv', import.meta.url), 'utf8'));

  it('handles title rows, NFD headers, ₫ amounts, serial dates, bad rows and trailing blanks', async () => {
    const { prepared, records, issues, rowCount } = await parse(table);
    expect(prepared.headerRow).toBe(3);
    expect(rowCount).toBe(4);
    const lines = records as OrderLineRecord[];
    expect(lines.map((l) => l.orderStatus)).toEqual(['completed', 'cancelled', 'in_progress']);
    expect(lines[0]).toMatchObject({ unitListPriceVnd: 189_000n, grossRevenueVnd: 318_000n, skuKey: 'sku:HL-002-A' });
    expect(lines[1]).toMatchObject({ orderedAt: '2026-10-01T17:00:00.000Z', skuKey: 'name:thot go me tay|lon' });
    expect(issues).toEqual([
      { sourceRow: 7, code: 'UNKNOWN_STATUS', column: 'order_status' },
      { sourceRow: 8, code: 'INVALID_VALUE', column: 'deal_price' },
    ]);
    expect(serialise(issues)).not.toContain('abc');
  });
});

describe('detection', () => {
  it('rejects an unknown file', () => {
    expect(detect(REGISTRY, [['Cột A', 'Cột B'], ['1', '2']]).kind).toBe('unknown');
  });

  it('reports ambiguity when two parsers fit equally', () => {
    const twin = { ...shopeeOrdersV1, id: 'shopee.orders@v2' as const };
    expect(detect([shopeeOrdersV1, twin], ordersExport(generateShop({ days: 2, products: 2 }))).kind).toBe('ambiguous');
  });

  it('warns about unmapped headers when a known type changes shape', () => {
    const table = [['sku_key', 'gia_von', 'cot_moi'], ['sku:A', '1000', 'x']];
    const d = detect([sellerUnitCostsV1], table);
    expect(d.kind).toBe('match');
    if (d.kind === 'match') {
      expect(prepare(d.candidate, table).unmappedHeaders).toEqual(['cot_moi']);
    }
  });
});

describe('12-month demo shop', () => {
  const shop = generateShop();
  const perDay = new Map<string, number>();
  for (const o of shop.orders) perDay.set(o.orderedOn, (perDay.get(o.orderedOn) ?? 0) + 1);
  const avg = (from: string, to: string) => {
    const days = [...perDay].filter(([d]) => d >= from && d <= to).map(([, n]) => n);
    return days.reduce((s, n) => s + n, 0) / days.length;
  };

  it('is deterministic and spans 12 months with ~180 SKUs', () => {
    expect(generateShop().orders.length).toBe(shop.orders.length);
    expect(shop.from).toBe('2025-11-01');
    expect(shop.to).toBe('2026-10-31');
    expect(shop.skus).toHaveLength(180);
    expect(shop.skus.some((s) => s.cogsVnd === null)).toBe(true);
  });

  it('has campaign spikes, a Tết dip and the May 2026 fee change', () => {
    expect(perDay.get('2025-11-11') ?? 0).toBeGreaterThan(avg('2025-11-01', '2025-11-08') * 2);
    expect(avg('2026-02-14', '2026-02-22')).toBeLessThan(avg('2026-03-01', '2026-03-31') / 2);
    const rate = (o: (typeof shop.orders)[number] | undefined) =>
      o && Number(o.fees.fixed * 10_000n / o.lines.reduce((s, l) => s + l.sku.dealPriceVnd * BigInt(l.quantity), 0n));
    const completed = shop.orders.filter((o) => o.status === 'completed');
    expect(rate(completed.find((o) => o.orderedOn < '2026-05-01'))).toBe(400);
    expect(rate(completed.find((o) => o.orderedOn >= '2026-05-01'))).toBe(500);
  });

  it('parses the full orders export', async () => {
    const { records } = await parse(ordersExport(shop));
    expect(records).toHaveLength(shop.orders.reduce((n, o) => n + o.lines.length, 0));
  });
});
