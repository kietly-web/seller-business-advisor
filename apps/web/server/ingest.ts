import {
  abortUpload,
  appendAudit,
  completeUpload,
  createUpload,
  listUploads,
  DuplicateUploadError,
  stageRecords,
  UploadStateError,
  withShopContext,
  type Db,
  type StagedRecord,
  type UploadSummary,
} from '@sa/db';
import { looksLikePii, parserById, recordHasPii, toWire, wireChunk, type ParserId } from '@sa/parsers';
import { asUploadId, asUserId, type ShopId } from '@sa/shared';
import { z } from 'zod';
import { recomputeMetrics } from './metrics';

export type IngestError = 'invalid' | 'duplicate' | 'pii_suspected' | 'state' | 'incomplete';
export type IngestResult<T> = ({ ok: true } & T) | { ok: false; error: IngestError };

const startSchema = z.strictObject({
  parserId: z.string().max(60),
  fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
  fileName: z.string().min(1).max(200),
  removedColumns: z.array(z.strictObject({ name: z.string().min(1).max(100), pii: z.boolean() })).max(200),
});

const finishSchema = z.strictObject({
  expectedRecords: z.number().int().min(0).max(200_000),
  issues: z
    .array(z.strictObject({ code: z.enum(['REQUIRED_MISSING', 'INVALID_VALUE', 'UNKNOWN_STATUS', 'COST_MISSING', 'COLUMN_COUNT']), count: z.number().int().min(1) }))
    .max(10),
});

const uploadIdSchema = z.uuid();

export type StartUploadInput = z.input<typeof startSchema>;
export type FinishUploadInput = z.input<typeof finishSchema>;

interface Who {
  userId: string;
  shopId: ShopId;
}

const inShop = <T>(db: Db, who: Who, fn: Parameters<typeof withShopContext<T>>[2]) =>
  withShopContext(db, { role: 'sa_app', shopId: who.shopId, userId: asUserId(who.userId) }, fn);

function stateError(error: unknown): IngestResult<never> {
  if (error instanceof UploadStateError) {
    return { ok: false, error: error.reason === 'incomplete' ? 'incomplete' : 'state' };
  }
  throw error;
}

function safeFileName(input: string): string {
  const base = input.replace(/^.*[\\/]/, '');
  return looksLikePii(base) ? `file${/\.[a-z0-9]{1,5}$/i.exec(base)?.[0] ?? ''}` : base;
}

export async function startUpload(db: Db, who: Who, input: unknown): Promise<IngestResult<{ uploadId: string; salt: string }>> {
  const parsed = startSchema.safeParse(input);
  const parser = parsed.success ? parserById(parsed.data.parserId as ParserId) : undefined;
  if (!parsed.success || !parser) {
    return { ok: false, error: 'invalid' };
  }
  const { data } = parsed;
  if (data.removedColumns.some((c) => looksLikePii(c.name))) {
    return { ok: false, error: 'pii_suspected' };
  }
  try {
    const created = await inShop(db, who, (tx) =>
      createUpload(tx, {
        shopId: who.shopId,
        userId: who.userId,
        exportType: parser.exportType,
        parserId: parser.id,
        fileSha256: data.fileSha256,
        fileName: safeFileName(data.fileName),
        removedColumns: data.removedColumns,
      }),
    );
    return { ok: true, uploadId: created.uploadId, salt: Buffer.from(created.salt).toString('base64') };
  } catch (error) {
    if (error instanceof DuplicateUploadError) {
      return { ok: false, error: 'duplicate' };
    }
    return stateError(error);
  }
}

export async function sendChunk(db: Db, who: Who, uploadIdInput: unknown, records: unknown): Promise<IngestResult<object>> {
  const uploadId = uploadIdSchema.safeParse(uploadIdInput);
  const parsed = wireChunk.safeParse(records);
  if (!uploadId.success || !parsed.success) {
    return { ok: false, error: 'invalid' };
  }
  const id = asUploadId(uploadId.data);
  const canonical = parsed.data as Parameters<typeof toWire>[0][];
  if (canonical.some(recordHasPii)) {
    // The value is never logged: a hit here means a parser bug let buyer data through
    await inShop(db, who, async (tx) => {
      await abortUpload(tx, who.shopId, id);
      await appendAudit(tx, { shopId: who.shopId, actor: who.userId, action: 'upload.rejected_pii', entityId: id });
    });
    console.error(`[ingest] PII_SUSPECTED upload=${id}`);
    return { ok: false, error: 'pii_suspected' };
  }
  try {
    await inShop(db, who, (tx) => stageRecords(tx, who.shopId, id, canonical.map((r) => toWire(r) as StagedRecord)));
    return { ok: true };
  } catch (error) {
    return stateError(error);
  }
}

export async function finishUpload(
  db: Db,
  who: Who,
  uploadIdInput: unknown,
  input: unknown,
  options: { recompute?: boolean } = {},
): Promise<IngestResult<{ rowCount: number; unknownSkuRows: number; periodFrom: string | null; periodTo: string | null }>> {
  const uploadId = uploadIdSchema.safeParse(uploadIdInput);
  const parsed = finishSchema.safeParse(input);
  if (!uploadId.success || !parsed.success) {
    return { ok: false, error: 'invalid' };
  }
  try {
    const result = await inShop(db, who, (tx) =>
      completeUpload(tx, {
        shopId: who.shopId,
        uploadId: asUploadId(uploadId.data),
        userId: who.userId,
        expectedRecords: parsed.data.expectedRecords,
        warnings: parsed.data.issues,
      }),
    );
    if (options.recompute !== false) {
      await recomputeMetrics(db, who);
    }
    return { ok: true, ...result };
  } catch (error) {
    return stateError(error);
  }
}

export async function cancelUpload(db: Db, who: Who, uploadIdInput: unknown): Promise<void> {
  const uploadId = uploadIdSchema.safeParse(uploadIdInput);
  if (uploadId.success) {
    await inShop(db, who, async (tx) => {
      await abortUpload(tx, who.shopId, asUploadId(uploadId.data));
      await appendAudit(tx, { shopId: who.shopId, actor: who.userId, action: 'upload.aborted', entityId: uploadId.data });
    });
  }
}

export function recentUploads(db: Db, who: Who): Promise<UploadSummary[]> {
  return inShop(db, who, (tx) => listUploads(tx, who.shopId, 10));
}
