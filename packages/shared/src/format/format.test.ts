import { describe, expect, it } from 'vitest';
import { asIsoDate } from '../calendar/ict';
import { formatDate, formatInstantDate, parseDisplayDate } from './date';
import { formatVnd, formatVndCompact, parseVnd } from './money';
import { formatPercent } from './percent';

const NBSP = ' ';

describe('formatVnd', () => {
  it.each([
    [189_000n, `189.000${NBSP}₫`],
    [1_234_000n, `1.234.000${NBSP}₫`],
    [999n, `999${NBSP}₫`],
    [0n, `0${NBSP}₫`],
    [-1_234_567n, `-1.234.567${NBSP}₫`],
  ])('%s → %s', (amount, expected) => {
    expect(formatVnd(amount)).toBe(expected);
  });
});

describe('formatVndCompact', () => {
  it.each([
    [95_000n, `95.000${NBSP}₫`],
    [100_000n, `0,1${NBSP}triệu${NBSP}₫`],
    [900_000n, `0,9${NBSP}triệu${NBSP}₫`],
    [1_400_000n, `1,4${NBSP}triệu${NBSP}₫`],
    [2_000_000n, `2${NBSP}triệu${NBSP}₫`],
    [1_250_000n, `1,3${NBSP}triệu${NBSP}₫`],
    [-900_000n, `-0,9${NBSP}triệu${NBSP}₫`],
    [999_960_000n, `1${NBSP}tỷ${NBSP}₫`],
    [1_234_000_000_000n, `1.234${NBSP}tỷ${NBSP}₫`],
  ])('%s → %s', (amount, expected) => {
    expect(formatVndCompact(amount)).toBe(expected);
  });
});

describe('parseVnd', () => {
  it.each([
    ['189000', 189_000n],
    ['189.000', 189_000n],
    ['189,000', 189_000n],
    ['₫189.000', 189_000n],
    ['189.000 ₫', 189_000n],
    [`189.000${NBSP}₫`, 189_000n],
    ['189.000đ', 189_000n],
    ['1.234.000 VND', 1_234_000n],
    ['1.234.000 VNĐ', 1_234_000n],
    ['189 000', 189_000n],
    ['-25.000', -25_000n],
    ['189000.00', 189_000n],
    ['1.234,00', 1_234n],
    ['1,234.00', 1_234n],
  ])('%j → %s', (input, expected) => {
    expect(parseVnd(input)).toBe(expected);
  });

  it.each(['', '-', 'abc', '189000.5', '1.234.00', '1.23.456', '12,34', '1.234,567.000'])('%j → null', (input) => {
    expect(parseVnd(input)).toBeNull();
  });

  it('round-trips with formatVnd', () => {
    for (const amount of [0n, 7n, 189_000n, -42_500n, 12_345_678_901n]) {
      expect(parseVnd(formatVnd(amount))).toBe(amount);
    }
  });
});

describe('formatPercent', () => {
  it.each([
    [0.06, 1, '6%'],
    [0.125, 1, '12,5%'],
    [0.1249, 1, '12,5%'],
    [-0.12, 1, '-12%'],
    [-0.0001, 1, '0%'],
    [0, 1, '0%'],
    [1.5, 1, '150%'],
    [0.1, 0, '10%'],
    [0.1236, 2, '12,36%'],
  ])('%s (max %s dp) → %s', (fraction, decimals, expected) => {
    expect(formatPercent(fraction, decimals)).toBe(expected);
  });

  it('rejects non-finite input', () => {
    expect(() => formatPercent(Number.NaN)).toThrow(RangeError);
  });
});

describe('dates', () => {
  it('formats as dd/MM/yyyy', () => {
    expect(formatDate(asIsoDate('2026-11-04'))).toBe('04/11/2026');
  });

  it('formats instants in ICT', () => {
    expect(formatInstantDate(new Date('2026-11-01T17:30:00Z'))).toBe('02/11/2026');
  });

  it.each([
    ['04/11/2026', '2026-11-04'],
    ['4/11/2026', '2026-11-04'],
    [' 29/02/2028 ', '2028-02-29'],
  ])('parses %j', (input, expected) => {
    expect(parseDisplayDate(input)).toBe(expected);
  });

  it.each(['31/02/2026', '2026-11-04', '04-11-2026', ''])('rejects %j', (input) => {
    expect(parseDisplayDate(input)).toBeNull();
  });
});
