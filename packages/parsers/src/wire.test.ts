import { describe, expect, it } from 'vitest';
import { createOrderHasher } from './hash';
import { REGISTRY } from './index';
import { detect } from './detect';
import { prepare, transform } from './pipeline';
import { generateShop, ordersExport, incomeExport } from './synthetic';
import { fromWire, looksLikePii, toWire } from './wire';
import { asIsoDate } from '@sa/shared';

describe('wire format', () => {
  it('round-trips parsed records through JSON and zod', async () => {
    const shop = generateShop({ days: 20, products: 4 });
    for (const table of [ordersExport(shop), incomeExport(shop)]) {
      const d = detect(REGISTRY, table);
      if (d.kind !== 'match') throw new Error(d.kind);
      const { records } = await transform(prepare(d.candidate, table), table, {
        hashOrderId: createOrderHasher(new Uint8Array(16)),
        today: asIsoDate('2026-11-05'),
      });
      const wire = JSON.parse(JSON.stringify(records.slice(0, 50).map(toWire))) as unknown;
      expect(fromWire(wire)).toEqual(records.slice(0, 50));
    }
  });

  it('rejects unknown keys, bad hashes and oversized chunks', () => {
    const ok = { kind: 'stock', sourceRow: 2, skuKey: 'sku:A1', asOf: '2026-01-01', onHand: 3, leadTimeDays: null };
    expect(() => fromWire([ok])).not.toThrow();
    expect(() => fromWire([{ ...ok, buyerName: 'x' }])).toThrow();
    expect(() => fromWire([{ ...ok, asOf: '2026-02-30' }])).toThrow();
    expect(() => fromWire([{ ...ok, skuKey: 'A1' }])).toThrow();
    expect(() =>
      fromWire([{ kind: 'fee_line', sourceRow: 2, orderHash: '251101ABCD0001', feeType: 'service', amountVnd: '1', incurredOn: '2026-01-01' }]),
    ).toThrow();
    expect(() => fromWire(Array.from({ length: 1001 }, () => ok))).toThrow();
    expect(() => fromWire([])).toThrow();
  });
});

describe('PII value scan', () => {
  it.each(['0900000000', 'gọi 090 000 0000', '+84900000000', '84900000000', 'a@b.vn'])('flags %s', (v) => {
    expect(looksLikePii(v)).toBe(true);
  });

  it.each(['Kệ gia vị 3 tầng', 'sku:HL-001-A', '8412345678901', 'Tivi 32" Sony', '2026-10-01T02:30:00.000Z'])('allows %s', (v) => {
    expect(looksLikePii(v)).toBe(false);
  });
});
