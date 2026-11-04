import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, numeric, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, id, tstz } from './columns';
import { shop } from './tenancy';

export const auditLog = app.table('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  shopId: uuid('shop_id').references(() => shop.id, { onDelete: 'cascade' }),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  meta: jsonb('meta').notNull().default({}),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const dataRequest = app.table(
  'data_request',
  {
    id: id(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    ackDueAt: tstz('ack_due_at').notNull(),
    dueAt: tstz('due_at').notNull(),
    ackedAt: tstz('acked_at'),
    completedAt: tstz('completed_at'),
    status: text('status').notNull(),
  },
  (t) => [
    check(
      'data_request_kind_check',
      sql`${t.kind} in ('access', 'export', 'correct', 'withdraw_consent', 'delete')`,
    ),
    check('data_request_status_check', sql`${t.status} in ('open', 'acked', 'completed', 'rejected')`),
  ],
);

export const job = app.table(
  'job',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    kind: text('kind').notNull(),
    shopId: uuid('shop_id').references(() => shop.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull().default({}),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lockedAt: tstz('locked_at'),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    doneAt: tstz('done_at'),
    dedupeKey: text('dedupe_key'),
  },
  (t) => [
    index('job_due_idx').on(t.runAfter).where(sql`${t.doneAt} is null`),
    unique('job_shop_dedupe_unique').on(t.shopId, t.dedupeKey).nullsNotDistinct(),
  ],
);

export const llmCall = app.table(
  'llm_call',
  {
    id: id(),
    shopId: uuid('shop_id').references(() => shop.id, { onDelete: 'set null' }),
    purpose: text('purpose').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    latencyMs: integer('latency_ms'),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
    validation: text('validation').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'llm_call_validation_check',
      sql`${t.validation} in ('passed', 'failed_placeholder', 'failed_schema', 'refused', 'error')`,
    ),
  ],
);
