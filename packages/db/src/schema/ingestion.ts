import { sql } from 'drizzle-orm';
import { check, date, foreignKey, integer, jsonb, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, id, tstz } from './columns';
import { shop } from './tenancy';

export const upload = app.table(
  'upload',
  {
    id: id(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    uploadedBy: text('uploaded_by').notNull(),
    exportType: text('export_type').notNull(),
    parserId: text('parser_id').notNull(),
    fileSha256: text('file_sha256').notNull(),
    fileName: text('file_name').notNull(),
    removedColumns: jsonb('removed_columns').notNull(),
    rowCount: integer('row_count'),
    periodFrom: date('period_from'),
    periodTo: date('period_to'),
    status: text('status').notNull(),
    warnings: jsonb('warnings').notNull().default([]),
    createdAt: createdAt(),
    parsedAt: tstz('parsed_at'),
  },
  (t) => [
    unique('upload_shop_file_unique').on(t.shopId, t.fileSha256),
    unique('upload_shop_id_unique').on(t.shopId, t.id),
    check('upload_status_check', sql`${t.status} in ('receiving', 'parsed', 'failed', 'superseded')`),
  ],
);

export const ingestStage = app.table(
  'ingest_stage',
  {
    uploadId: uuid('upload_id').notNull(),
    shopId: uuid('shop_id')
      .notNull()
      .references(() => shop.id, { onDelete: 'cascade' }),
    recordKind: text('record_kind').notNull(),
    sourceRow: integer('source_row').notNull(),
    seq: integer('seq').notNull().default(0),
    record: jsonb('record').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.shopId, t.uploadId, t.recordKind, t.sourceRow, t.seq] }),
    foreignKey({ name: 'ingest_stage_upload_fk', columns: [t.shopId, t.uploadId], foreignColumns: [upload.shopId, upload.id] }).onDelete('cascade'),
    check(
      'ingest_stage_kind_check',
      sql`${t.recordKind} in ('order_line', 'fee_line', 'product_traffic', 'sku', 'stock', 'unit_cost')`,
    ),
  ],
);
