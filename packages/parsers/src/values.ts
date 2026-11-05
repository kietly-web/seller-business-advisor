import { asIsoDate, parseVnd, type IsoDate } from '@sa/shared';

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const EXCEL_SERIAL = /^\d{5}(\.\d+)?$/;
const DATE_TIME =
  /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](\d{4}))(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function parts(input: string): Parts | null {
  const v = input.trim();
  if (EXCEL_SERIAL.test(v)) {
    const ms = Math.round(EXCEL_EPOCH_MS + Number(v) * DAY_MS);
    const t = new Date(ms);
    return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() };
  }
  const m = DATE_TIME.exec(v);
  if (!m) {
    return null;
  }
  const [, iy, imo, id, dd, dmo, dy, h = '0', mi = '0', s = '0'] = m;
  const p = {
    y: Number(iy ?? dy),
    mo: Number(imo ?? dmo),
    d: Number(id ?? dd),
    h: Number(h),
    mi: Number(mi),
    s: Number(s),
  };
  return p.h < 24 && p.mi < 60 && p.s < 60 ? p : null;
}

function isoOf(p: Parts): IsoDate | null {
  try {
    return asIsoDate(`${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`);
  } catch {
    return null;
  }
}

export function parseDateCell(input: string): IsoDate | null {
  const p = parts(input);
  return p ? isoOf(p) : null;
}

export function parseDateTimeCell(input: string): string | null {
  const p = parts(input);
  if (!p || !isoOf(p)) {
    return null;
  }
  return new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - ICT_OFFSET_MS).toISOString();
}

export function parseIntCell(input: string): number | null {
  const v = input.trim().replace(/[.,](?=\d{3}(\D|$))/g, '');
  if (!/^-?\d+$/.test(v)) {
    return null;
  }
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

export function parseVndCell(input: string): bigint | null {
  return parseVnd(input.trim());
}
