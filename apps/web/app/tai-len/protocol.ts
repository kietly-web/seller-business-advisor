import type { RemovedColumn, WireRecord } from '@sa/parsers';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const WARN_FILE_BYTES = 15 * 1024 * 1024;

export interface Inspection {
  parserId: string;
  exportType: string;
  assumed: boolean;
  rows: number;
  mapped: string[];
  removedColumns: RemovedColumn[];
}

export type ToWorker =
  | { type: 'inspect'; file: File }
  | { type: 'choose'; parserId: string }
  | { type: 'transform'; salt: string; today: string };

export type FromWorker =
  | { type: 'inspected'; sha256: string; result: { kind: 'match'; inspection: Inspection } | { kind: 'ambiguous'; parserIds: string[] } | { kind: 'unknown' } }
  | { type: 'chosen'; inspection: Inspection | null }
  | { type: 'transformed'; records: WireRecord[]; issues: { code: string; count: number }[] }
  | { type: 'error'; reason: 'read' | 'tooLarge' };
