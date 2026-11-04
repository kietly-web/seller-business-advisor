import { describe, expect, it } from 'vitest';
import { addDays, asIsoDate, daysBetween, toIctDate } from './ict';
import { addWeeks, asIsoWeek, compareIsoWeek, ictIsoWeekOf, isoWeekOf, weekEnd, weekStart, weeksInYear } from './week';

const d = asIsoDate;
const w = asIsoWeek;

describe('IsoDate', () => {
  it('rejects impossible dates', () => {
    expect(() => asIsoDate('2026-02-30')).toThrow();
    expect(() => asIsoDate('2026-2-3')).toThrow();
  });

  it('converts instants to the Vietnamese business date', () => {
    expect(toIctDate(new Date('2026-11-01T16:59:59Z'))).toBe('2026-11-01');
    expect(toIctDate(new Date('2026-11-01T17:00:00Z'))).toBe('2026-11-02');
  });

  it('adds and counts days across month and year ends', () => {
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(d('2028-03-01'), -1)).toBe('2028-02-29');
    expect(daysBetween(d('2026-11-02'), d('2026-11-30'))).toBe(28);
  });
});

describe('IsoWeek', () => {
  it.each([
    ['2026-11-04', '2026-W45'],
    ['2026-01-01', '2026-W01'],
    ['2025-12-29', '2026-W01'],
    ['2027-01-01', '2026-W53'],
    ['2027-01-03', '2026-W53'],
    ['2027-01-04', '2027-W01'],
    ['2021-01-03', '2020-W53'],
  ])('%s is in %s', (date, week) => {
    expect(isoWeekOf(d(date))).toBe(week);
  });

  it('uses the ICT date, not the UTC date, at the Monday boundary', () => {
    expect(ictIsoWeekOf(new Date('2026-11-01T16:59:59Z'))).toBe('2026-W44');
    expect(ictIsoWeekOf(new Date('2026-11-01T17:00:00Z'))).toBe('2026-W45');
  });

  it('knows which years have 53 weeks', () => {
    expect(weeksInYear(2020)).toBe(53);
    expect(weeksInYear(2025)).toBe(52);
    expect(weeksInYear(2026)).toBe(53);
  });

  it('validates week strings', () => {
    expect(w('2026-W53')).toBe('2026-W53');
    expect(() => w('2025-W53')).toThrow();
    expect(() => w('2026-W00')).toThrow();
    expect(() => w('2026-W5')).toThrow();
  });

  it('returns Monday to Sunday bounds', () => {
    expect(weekStart(w('2026-W45'))).toBe('2026-11-02');
    expect(weekEnd(w('2026-W45'))).toBe('2026-11-08');
    expect(weekStart(w('2026-W01'))).toBe('2025-12-29');
  });

  it('adds weeks across 53-week years', () => {
    expect(addWeeks(w('2026-W52'), 1)).toBe('2026-W53');
    expect(addWeeks(w('2026-W53'), 1)).toBe('2027-W01');
    expect(addWeeks(w('2026-W01'), -1)).toBe('2025-W52');
  });

  it('orders weeks chronologically', () => {
    expect(compareIsoWeek(w('2026-W09'), w('2026-W45'))).toBe(-1);
    expect(compareIsoWeek(w('2026-W53'), w('2027-W01'))).toBe(-1);
    expect(compareIsoWeek(w('2026-W45'), w('2026-W45'))).toBe(0);
  });

  it('places every day of 2019–2030 inside its own Monday–Sunday week', () => {
    let day = d('2019-01-01');
    while (day <= '2030-12-31') {
      const week = isoWeekOf(day);
      const start = weekStart(week);
      expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(daysBetween(start, day)).toBeGreaterThanOrEqual(0);
      expect(daysBetween(day, weekEnd(week))).toBeGreaterThanOrEqual(0);
      day = addDays(day, 1);
    }
  });
});
