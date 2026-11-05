import { normaliseHeader } from './normalise';
import type { ColumnSpec, ExportParser } from './types';

export const ACCEPT_SCORE = 0.8;
export const ACCEPT_MARGIN = 0.15;

export interface ColumnMatch {
  index: number;
  spec: ColumnSpec;
}

export function matchColumns(columns: readonly ColumnSpec[], headers: readonly string[]): ColumnMatch[] {
  const normalised = headers.map(normaliseHeader);
  const matches: ColumnMatch[] = [];
  for (const spec of columns) {
    const aliases = new Set(spec.aliases.map(normaliseHeader));
    const index = normalised.findIndex((h, i) => h !== '' && aliases.has(h) && !matches.some((m) => m.index === i));
    if (index >= 0) {
      matches.push({ index, spec });
    }
  }
  return matches;
}

export function scoreHeaders(columns: readonly ColumnSpec[], headers: readonly string[]): number {
  const matched = new Set(matchColumns(columns, headers).map((m) => m.spec.key));
  const required = columns.filter((c) => c.required);
  const optional = columns.filter((c) => !c.required);
  const req = required.length === 0 ? 1 : required.filter((c) => matched.has(c.key)).length / required.length;
  const opt = optional.length === 0 ? req : optional.filter((c) => matched.has(c.key)).length / optional.length;
  return Math.round((req * 0.8 + opt * 0.2) * 1e4) / 1e4;
}

export interface Candidate {
  parser: ExportParser;
  headerRow: number;
  score: number;
}

export type Detection =
  | { kind: 'match'; candidate: Candidate }
  | { kind: 'ambiguous'; candidates: Candidate[] }
  | { kind: 'unknown'; best: Candidate | null };

export function bestHeaderRow(parser: ExportParser, table: readonly (readonly string[])[]): Candidate | null {
  let best: Candidate | null = null;
  const limit = Math.min(parser.headerRowSearch, table.length);
  for (let r = 0; r < limit; r++) {
    const score = scoreHeaders(parser.columns, table[r] ?? []);
    if (score > 0 && (!best || score > best.score)) {
      best = { parser, headerRow: r, score };
    }
  }
  return best;
}

export function detect(registry: readonly ExportParser[], table: readonly (readonly string[])[]): Detection {
  const ranked = registry
    .map((p) => bestHeaderRow(p, table))
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.score - a.score);
  const [top, runnerUp] = ranked;
  if (!top || top.score < ACCEPT_SCORE) {
    return { kind: 'unknown', best: top ?? null };
  }
  if (runnerUp && top.score - runnerUp.score < ACCEPT_MARGIN) {
    return { kind: 'ambiguous', candidates: ranked.filter((c) => c.score >= ACCEPT_SCORE) };
  }
  return { kind: 'match', candidate: top };
}
