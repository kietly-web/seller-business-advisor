import { toIctDate, type IsoDate } from '@sa/shared';
import { matchColumns, type Candidate, type ColumnMatch } from './detect';
import type { OrderHasher } from './hash';
import { normaliseHeader } from './normalise';
import { isPiiHeader } from './pii-headers';
import type { CanonicalRecord, CellValue, ColumnSpec, ExportParser, RowIssue } from './types';
import { parseDateCell, parseDateTimeCell, parseIntCell, parseVndCell } from './values';

const UNMAPPED_WARNING_BELOW = 0.95;

export interface RemovedColumn {
  name: string;
  pii: boolean;
}

export interface PreparedTable {
  parser: ExportParser;
  score: number;
  headerRow: number;
  mapped: { header: string; key: string }[];
  removedColumns: RemovedColumn[];
  unmappedHeaders: string[];
  matches: ColumnMatch[];
}

export function prepare(candidate: Candidate, table: readonly (readonly string[])[]): PreparedTable {
  const { parser, headerRow, score } = candidate;
  const headers = table[headerRow] ?? [];
  const matches = matchColumns(parser.columns, headers);
  const mappedIdx = new Set(matches.map((m) => m.index));
  const removedColumns = headers
    .map((name, index) => ({ name: name.trim(), index }))
    .filter((h) => h.name !== '' && !mappedIdx.has(h.index))
    .map((h) => ({ name: h.name, pii: isPiiHeader(h.name) }));
  return {
    parser,
    score,
    headerRow,
    matches,
    mapped: matches.map((m) => ({ header: (headers[m.index] ?? '').trim(), key: m.spec.key })),
    removedColumns,
    unmappedHeaders: score < UNMAPPED_WARNING_BELOW ? removedColumns.filter((c) => !c.pii).map((c) => c.name) : [],
  };
}

export interface TransformResult {
  records: CanonicalRecord[];
  issues: RowIssue[];
  rowCount: number;
  period: { from: IsoDate; to: IsoDate } | null;
}

export async function transform(
  prepared: PreparedTable,
  table: readonly (readonly string[])[],
  opts: { hashOrderId: OrderHasher; today: IsoDate },
): Promise<TransformResult> {
  const { parser, matches } = prepared;
  const records: CanonicalRecord[] = [];
  const issues: RowIssue[] = [];
  const ctx = { today: opts.today, warn: (issue: RowIssue) => issues.push(issue) };
  let rowCount = 0;

  for (let r = prepared.headerRow + 1; r < table.length; r++) {
    const cells = table[r] ?? [];
    if (cells.every((c) => c.trim() === '')) {
      continue;
    }
    rowCount++;
    const sourceRow = r + 1;
    const row: Record<string, CellValue> = {};
    let ok = true;
    for (const { index, spec } of matches) {
      const raw = (cells[index] ?? '').trim();
      const value = raw === '' ? null : await parseCell(spec, raw, parser, sourceRow, ctx.warn, opts.hashOrderId);
      if (value === undefined) {
        ok = false;
        break;
      }
      if (value === null && spec.required && !spec.blankAllowed) {
        issues.push({ sourceRow, code: 'REQUIRED_MISSING', column: spec.key });
        ok = false;
        break;
      }
      row[spec.key] = value;
    }
    if (ok) {
      records.push(...parser.toCanonical(row, sourceRow, ctx));
    }
  }
  return { records, issues, rowCount, period: periodOf(records) };
}

async function parseCell(
  spec: ColumnSpec,
  raw: string,
  parser: ExportParser,
  sourceRow: number,
  warn: (issue: RowIssue) => void,
  hashOrderId: OrderHasher,
): Promise<CellValue | undefined> {
  let value: CellValue = null;
  switch (spec.parse) {
    case 'text':
      return raw.normalize('NFC');
    case 'order_id':
      return hashOrderId(raw);
    case 'status': {
      const status = parser.statusMap?.[normaliseHeader(raw)];
      if (status) {
        return status;
      }
      warn({ sourceRow, code: 'UNKNOWN_STATUS', column: spec.key });
      return 'in_progress';
    }
    case 'vnd':
      value = parseVndCell(raw);
      break;
    case 'int':
      value = parseIntCell(raw);
      break;
    case 'date':
      value = parseDateCell(raw);
      break;
    case 'datetime':
      value = parseDateTimeCell(raw);
      break;
  }
  if (value === null) {
    warn({ sourceRow, code: 'INVALID_VALUE', column: spec.key });
    return undefined;
  }
  return value;
}

function recordDate(r: CanonicalRecord): IsoDate {
  switch (r.kind) {
    case 'order_line':
      return toIctDate(new Date(r.orderedAt));
    case 'fee_line':
      return r.incurredOn;
    case 'unit_cost':
      return r.effectiveFrom;
    case 'stock':
      return r.asOf;
  }
}

function periodOf(records: readonly CanonicalRecord[]): { from: IsoDate; to: IsoDate } | null {
  let from: IsoDate | null = null;
  let to: IsoDate | null = null;
  for (const r of records) {
    const d = recordDate(r);
    if (!from || d < from) from = d;
    if (!to || d > to) to = d;
  }
  return from && to ? { from, to } : null;
}
