import type { Brand } from '../ids';

export type IsoDate = Brand<string, 'IsoDate'>;

const DAY_MS = 86_400_000;
// Vietnam has had no DST since 1975, so a fixed offset is exact and avoids runtime ICU differences
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function asIsoDate(value: string): IsoDate {
  const m = ISO_DATE.exec(value);
  if (!m) {
    throw new TypeError(`Invalid IsoDate: ${value}`);
  }
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`Invalid IsoDate: ${value}`);
  }
  return value as IsoDate;
}

export function toIctDate(instant: Date): IsoDate {
  return new Date(instant.getTime() + ICT_OFFSET_MS).toISOString().slice(0, 10) as IsoDate;
}

export function isoDateToUtcMs(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function utcMsToIsoDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10) as IsoDate;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return utcMsToIsoDate(isoDateToUtcMs(date) + days * DAY_MS);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((isoDateToUtcMs(to) - isoDateToUtcMs(from)) / DAY_MS);
}
