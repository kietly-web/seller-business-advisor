import { asIsoDate, toIctDate, type IsoDate } from '../calendar/ict';

export function formatDate(date: IsoDate): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export function formatInstantDate(instant: Date): string {
  return formatDate(toIctDate(instant));
}

const DISPLAY_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseDisplayDate(input: string): IsoDate | null {
  const m = DISPLAY_DATE.exec(input.trim());
  if (!m) {
    return null;
  }
  const [, d = '', mo = '', y = ''] = m;
  try {
    return asIsoDate(`${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`);
  } catch {
    return null;
  }
}
