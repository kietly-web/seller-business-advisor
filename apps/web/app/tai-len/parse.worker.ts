/// <reference lib="webworker" />
import {
  bestHeaderRow,
  createOrderHasher,
  detect,
  parserById,
  prepare,
  REGISTRY,
  toWire,
  transform,
  type Candidate,
  type ParserId,
  type PreparedTable,
  type Table,
} from '@sa/parsers';
import { asIsoDate } from '@sa/shared';
import { MAX_FILE_BYTES, type FromWorker, type Inspection, type ToWorker } from './protocol';
import { readTable } from './read-table';

declare const self: DedicatedWorkerGlobalScope;

let table: Table = [];
let prepared: PreparedTable | null = null;

const post = (message: FromWorker) => self.postMessage(message);

function inspectionOf(p: PreparedTable): Inspection {
  return {
    parserId: p.parser.id,
    exportType: p.parser.exportType,
    assumed: p.parser.status === 'assumed',
    rows: table.slice(p.headerRow + 1).filter((r) => r.some((c) => c.trim() !== '')).length,
    mapped: p.mapped.map((m) => m.header),
    removedColumns: p.removedColumns,
  };
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  try {
    if (message.type === 'inspect') {
      prepared = null;
      if (message.file.size > MAX_FILE_BYTES) {
        post({ type: 'error', reason: 'tooLarge' });
        return;
      }
      const bytes = await message.file.arrayBuffer();
      const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
      table = readTable(message.file.name, bytes);
      const detection = detect(REGISTRY, table);
      if (detection.kind === 'match') {
        prepared = prepare(detection.candidate, table);
        post({ type: 'inspected', sha256, result: { kind: 'match', inspection: inspectionOf(prepared) } });
      } else if (detection.kind === 'ambiguous') {
        post({ type: 'inspected', sha256, result: { kind: 'ambiguous', parserIds: detection.candidates.map((c) => c.parser.id) } });
      } else {
        post({ type: 'inspected', sha256, result: { kind: 'unknown' } });
      }
    } else if (message.type === 'choose') {
      const parser = parserById(message.parserId as ParserId);
      const candidate: Candidate | null = parser ? bestHeaderRow(parser, table) : null;
      prepared = candidate ? prepare(candidate, table) : null;
      post({ type: 'chosen', inspection: prepared ? inspectionOf(prepared) : null });
    } else if (message.type === 'transform' && prepared) {
      const salt = Uint8Array.from(atob(message.salt), (c) => c.charCodeAt(0));
      const result = await transform(prepared, table, { hashOrderId: createOrderHasher(salt), today: asIsoDate(message.today) });
      const counts = new Map<string, number>();
      for (const issue of result.issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
      post({
        type: 'transformed',
        records: result.records.map(toWire),
        issues: [...counts].map(([code, count]) => ({ code, count })),
      });
      table = [];
      prepared = null;
    }
  } catch {
    post({ type: 'error', reason: 'read' });
  }
};
