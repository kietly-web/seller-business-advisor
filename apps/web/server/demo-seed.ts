import { createHash } from 'node:crypto';
import type { Db } from '@sa/db';
import { createOrderHasher, detect, MAX_CHUNK_RECORDS, prepare, REGISTRY, toWire, transform, writeCsv, type Table } from '@sa/parsers';
import { generateShop, incomeExport, ordersExport, stockFile, unitCostsFile } from '@sa/parsers/synthetic';
import { addDays, type IsoDate, type ShopId } from '@sa/shared';
import { finishUpload, sendChunk, startUpload } from './ingest';

// The demo shop goes through the same parse → validate → merge path as a seller's upload (FR-12)
export async function seedDemoShop(db: Db, who: { userId: string; shopId: ShopId }, today: IsoDate): Promise<void> {
  const shop = generateShop({ from: addDays(today, -365) });
  const files: [string, Table][] = [
    ['demo-don-hang.csv', ordersExport(shop)],
    ['demo-thu-nhap.csv', incomeExport(shop)],
    ['demo-gia-von.csv', unitCostsFile(shop, shop.from)],
    ['demo-ton-kho.csv', stockFile(shop, today)],
  ];
  for (const [fileName, table] of files) {
    await ingestTable(db, who, fileName, table, today);
  }
}

async function ingestTable(db: Db, who: { userId: string; shopId: ShopId }, fileName: string, table: Table, today: IsoDate) {
  const detection = detect(REGISTRY, table);
  if (detection.kind !== 'match') {
    throw new Error(`Demo file ${fileName} was not recognised`);
  }
  const prepared = prepare(detection.candidate, table);
  const started = await startUpload(db, who, {
    parserId: prepared.parser.id,
    fileSha256: createHash('sha256').update(`${who.shopId}:${writeCsv(table)}`).digest('hex'),
    fileName,
    removedColumns: prepared.removedColumns,
  });
  if (!started.ok) {
    throw new Error(`Demo upload ${fileName} failed: ${started.error}`);
  }
  const { records, issues } = await transform(prepared, table, {
    hashOrderId: createOrderHasher(Buffer.from(started.salt, 'base64')),
    today,
  });
  for (let i = 0; i < records.length; i += MAX_CHUNK_RECORDS) {
    const sent = await sendChunk(db, who, started.uploadId, records.slice(i, i + MAX_CHUNK_RECORDS).map(toWire));
    if (!sent.ok) {
      throw new Error(`Demo chunk for ${fileName} failed: ${sent.error}`);
    }
  }
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
  const done = await finishUpload(db, who, started.uploadId, {
    expectedRecords: records.length,
    issues: [...counts].map(([code, count]) => ({ code, count })),
  });
  if (!done.ok) {
    throw new Error(`Demo upload ${fileName} could not complete: ${done.error}`);
  }
}
