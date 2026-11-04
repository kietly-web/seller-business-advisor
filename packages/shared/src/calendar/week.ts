import type { Brand } from '../ids';
import { addDays, asIsoDate, isoDateToUtcMs, toIctDate, utcMsToIsoDate, type IsoDate } from './ict';

export type IsoWeek = Brand<string, 'IsoWeek'>;

const DAY_MS = 86_400_000;
const ISO_WEEK = /^(\d{4})-W(\d{2})$/;

function mondayIndex(utcMs: number): number {
  return (new Date(utcMs).getUTCDay() + 6) % 7;
}

function format(year: number, week: number): IsoWeek {
  return `${year}-W${String(week).padStart(2, '0')}` as IsoWeek;
}

export function isoWeekOf(date: IsoDate): IsoWeek {
  const ms = isoDateToUtcMs(date);
  const thursday = ms + (3 - mondayIndex(ms)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const ordinal = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS);
  return format(year, Math.floor(ordinal / 7) + 1);
}

export function ictIsoWeekOf(instant: Date): IsoWeek {
  return isoWeekOf(toIctDate(instant));
}

export function weeksInYear(year: number): number {
  return parseWeek(isoWeekOf(asIsoDate(`${String(year).padStart(4, '0')}-12-28`))).week;
}

function parseWeek(value: string): { year: number; week: number } {
  const m = ISO_WEEK.exec(value);
  if (!m) {
    throw new TypeError(`Invalid IsoWeek: ${value}`);
  }
  return { year: Number(m[1]), week: Number(m[2]) };
}

export function asIsoWeek(value: string): IsoWeek {
  const { year, week } = parseWeek(value);
  if (week < 1 || week > weeksInYear(year)) {
    throw new TypeError(`Invalid IsoWeek: ${value}`);
  }
  return value as IsoWeek;
}

export function weekStart(week: IsoWeek): IsoDate {
  const { year, week: n } = parseWeek(week);
  const jan4 = Date.UTC(year, 0, 4);
  const firstMonday = jan4 - mondayIndex(jan4) * DAY_MS;
  return utcMsToIsoDate(firstMonday + (n - 1) * 7 * DAY_MS);
}

export function weekEnd(week: IsoWeek): IsoDate {
  return addDays(weekStart(week), 6);
}

export function addWeeks(week: IsoWeek, weeks: number): IsoWeek {
  return isoWeekOf(addDays(weekStart(week), weeks * 7));
}

export function compareIsoWeek(a: IsoWeek, b: IsoWeek): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
