import { createOrderHasher, detect, prepare, REGISTRY, transform, type OrderLineRecord } from '@sa/parsers';
import { generateShop, ordersExport } from '@sa/parsers/synthetic';
import { asIsoDate } from '@sa/shared';
import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { readTable } from './read-table';

function xlsxOf(rows: unknown[][]): ArrayBuffer {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([]), 'Trống');
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), 'Đơn hàng');
  return write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('readTable', () => {
  it('reads the first non-empty sheet with numeric cells and serial dates', async () => {
    const table = ordersExport(generateShop({ days: 5, products: 2 }));
    const [header = [], ...body] = table;
    const typed = body.map((r) => r.map((c, i) => (i === 1 ? 46297.375 : /^\d+$/.test(c) && i !== 0 ? Number(c) : c)));
    const read = readTable('don-hang.xlsx', xlsxOf([header, ...typed]));
    expect(read[0]).toEqual(header);
    const d = detect(REGISTRY, read);
    if (d.kind !== 'match') throw new Error(d.kind);
    const { records, issues } = await transform(prepare(d.candidate, read), read, {
      hashOrderId: createOrderHasher(new Uint8Array(16)),
      today: asIsoDate('2026-11-05'),
    });
    expect(issues).toEqual([]);
    expect(records).toHaveLength(body.length);
    expect((records[0] as OrderLineRecord).orderedAt).toBe('2026-10-02T02:00:00.000Z');
  });

  it('reads CSV as UTF-8', () => {
    const bytes = new TextEncoder().encode('﻿Mã đơn hàng,Số lượng\r\nA,1\r\n');
    expect(readTable('x.CSV', bytes.buffer as ArrayBuffer)).toEqual([['Mã đơn hàng', 'Số lượng'], ['A', '1']]);
  });
});
