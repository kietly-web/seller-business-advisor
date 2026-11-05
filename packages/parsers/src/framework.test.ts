import { describe, expect, it } from 'vitest';
import { readCsv, textCell, writeCsv } from './csv';
import { createOrderHasher } from './hash';
import { REGISTRY } from './index';
import { normaliseHeader } from './normalise';
import { isPiiHeader, PII_HEADERS } from './pii-headers';
import { parseDateCell, parseDateTimeCell, parseIntCell, parseVndCell } from './values';

describe('normaliseHeader', () => {
  it.each([
    ['Mã đơn hàng', 'ma don hang'],
    ['MÃ ĐƠN HÀNG', 'ma don hang'],
    ['Ma don hang', 'ma don hang'],
    ['Mã đơn hàng'.normalize('NFD'), 'ma don hang'],
    ['  Giá vốn (₫) ', 'gia von'],
    ['sku_key', 'sku key'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseHeader(input)).toBe(expected);
  });
});

describe('PII allowlist (FR-04, ADR-003)', () => {
  it('no parser maps a known buyer-field header', () => {
    const offending = REGISTRY.flatMap((p) =>
      p.columns.flatMap((c) => c.aliases.filter(isPiiHeader).map((a) => `${p.id}:${c.key}:${a}`)),
    );
    expect(offending).toEqual([]);
  });

  it('flags every listed buyer header', () => {
    expect(PII_HEADERS.filter((h) => !isPiiHeader(h))).toEqual([]);
  });

  it('every parser maps order IDs only through order_id hashing', () => {
    for (const p of REGISTRY) {
      for (const c of p.columns) {
        if (c.aliases.some((a) => normaliseHeader(a) === 'ma don hang')) {
          expect(c.parse).toBe('order_id');
        }
      }
    }
  });
});

describe('cell values', () => {
  it.each([
    ['189.000', 189_000n],
    ['189,000', 189_000n],
    ['₫189.000', 189_000n],
    ['189.000 ₫', 189_000n],
    ['-15000', -15_000n],
    ['abc', null],
  ])('vnd %s', (input, expected) => {
    expect(parseVndCell(input)).toBe(expected);
  });

  it.each([
    ['01/10/2026', '2026-10-01'],
    ['2026-10-01', '2026-10-01'],
    ['01-10-2026 13:45', '2026-10-01'],
    ['46297', '2026-10-02'],
    ['31/02/2026', null],
    ['hôm qua', null],
  ])('date %s', (input, expected) => {
    expect(parseDateCell(input)).toBe(expected);
  });

  it('reads datetimes as Asia/Ho_Chi_Minh', () => {
    expect(parseDateTimeCell('01/10/2026 09:30')).toBe('2026-10-01T02:30:00.000Z');
    expect(parseDateTimeCell('2026-10-01 00:15:00')).toBe('2026-09-30T17:15:00.000Z');
    expect(parseDateTimeCell('46297.5')).toBe('2026-10-02T05:00:00.000Z');
    expect(parseDateTimeCell('2026-10-01 25:00')).toBeNull();
  });

  it.each([
    ['12', 12],
    ['1.200', 1200],
    ['-3', -3],
    ['1.5', null],
    ['x', null],
  ])('int %s', (input, expected) => {
    expect(parseIntCell(input)).toBe(expected);
  });
});

describe('csv', () => {
  it('treats a quote inside an unquoted cell as text, so later rows stay in their columns', () => {
    expect(readCsv('A1,Tivi 32" Sony,Mẫu\nA2,Quạt,Mẫu B\n')).toEqual([
      ['A1', 'Tivi 32" Sony', 'Mẫu'],
      ['A2', 'Quạt', 'Mẫu B'],
    ]);
  });

  it.each(['=HYPERLINK("x")', '+1', '-1', '@SUM(1)', '\tx'])('escapes formula start %s', (v) => {
    expect(textCell(v)).toBe(`'${v}`);
  });


  it('round-trips quotes, commas and newlines and drops the BOM', () => {
    const table = [['a', 'b,c', 'say "hi"'], ['line\nbreak', '', 'đ']];
    expect(readCsv(`﻿${writeCsv(table)}`)).toEqual(table);
  });
});

describe('order hashing', () => {
  const salt = new Uint8Array(32).fill(7);

  it('is deterministic per salt and never returns the raw ID', async () => {
    const hash = createOrderHasher(salt);
    const a = await hash('251101ABCD0001');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await createOrderHasher(salt)(' 251101ABCD0001 ')).toBe(a);
    expect(await createOrderHasher(new Uint8Array(32).fill(8))('251101ABCD0001')).not.toBe(a);
  });

  it('matches SHA-256(salt ‖ id)', async () => {
    const id = 'X1';
    const expected = Buffer.from(
      await crypto.subtle.digest('SHA-256', Buffer.concat([Buffer.from(salt), Buffer.from(id)])),
    ).toString('hex');
    expect(await createOrderHasher(salt)(id)).toBe(expected);
  });

  it('rejects a short salt', () => {
    expect(() => createOrderHasher(new Uint8Array(8))).toThrow();
  });
});

