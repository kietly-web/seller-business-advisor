import { asShopId, type ShopId } from '@sa/shared';
import { sql } from 'drizzle-orm';
import { withContext, withShopContext, type Db, type Tx } from './context';
import { rowsOf } from './repositories/rows';
import { job } from './schema';

export interface JobRow {
  id: number;
  kind: string;
  shopId: ShopId | null;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export type JobHandler = (tx: Tx, job: JobRow) => Promise<void>;

export interface RunSummary {
  claimed: number;
  done: number;
  retrying: number;
  deadLettered: number;
}

const LOCK_TIMEOUT = '5 minutes';
const MAX_ERROR_LENGTH = 500;

export async function enqueueJob(
  tx: Tx,
  input: { kind: string; shopId: ShopId; payload?: Record<string, unknown>; dedupeKey?: string; runAfter?: Date },
): Promise<void> {
  await tx
    .insert(job)
    .values({
      kind: input.kind,
      shopId: input.shopId,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey ?? null,
      runAfter: input.runAfter ?? new Date(),
    })
    .onConflictDoNothing();
}

export async function claimDueJobs(db: Db, workerId: string, limit: number): Promise<JobRow[]> {
  return withContext(db, { role: 'sa_worker' }, async (tx) => {
    const result = await tx.execute(sql`
      update app.job
      set locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
      where id in (
        select id from app.job
        where done_at is null
          and run_after <= now()
          and attempts < max_attempts
          and (locked_at is null or locked_at < now() - ${LOCK_TIMEOUT}::interval)
        order by run_after, id
        limit ${limit}
        for update skip locked
      )
      returning id, kind, shop_id, payload, attempts, max_attempts`);
    return rowsOf<{
      id: number | string;
      kind: string;
      shop_id: string | null;
      payload: unknown;
      attempts: number;
      max_attempts: number;
    }>(result).map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      shopId: r.shop_id ? asShopId(r.shop_id) : null,
      payload: r.payload,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
    }));
  });
}

async function finish(
  db: Db,
  row: JobRow,
  failure: { error: unknown } | null,
): Promise<'done' | 'retrying' | 'deadLettered'> {
  return withContext(db, { role: 'sa_worker' }, async (tx) => {
    if (failure === null) {
      await tx.execute(sql`update app.job set done_at = now(), locked_at = null, last_error = null where id = ${row.id}`);
      return 'done';
    }
    const { error } = failure;
    const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
    const backoffMinutes = 2 ** row.attempts;
    await tx.execute(sql`
      update app.job
      set locked_at = null, last_error = ${message},
          run_after = now() + make_interval(mins => ${backoffMinutes})
      where id = ${row.id}`);
    return row.attempts >= row.maxAttempts ? 'deadLettered' : 'retrying';
  });
}

export async function runDueJobs(
  db: Db,
  handlers: Readonly<Record<string, JobHandler>>,
  options: { workerId: string; limit?: number },
): Promise<RunSummary> {
  const claimed = await claimDueJobs(db, options.workerId, options.limit ?? 10);
  const summary: RunSummary = { claimed: claimed.length, done: 0, retrying: 0, deadLettered: 0 };
  for (const row of claimed) {
    const handler = handlers[row.kind];
    let failure: { error: unknown } | null = null;
    try {
      if (!handler) {
        throw new Error(`No handler for job kind "${row.kind}"`);
      }
      if (row.shopId) {
        await withShopContext(db, { role: 'sa_worker', shopId: row.shopId }, (tx) => handler(tx, row));
      } else {
        await withContext(db, { role: 'sa_worker' }, (tx) => handler(tx, row));
      }
    } catch (error) {
      failure = { error };
    }
    summary[await finish(db, row, failure)] += 1;
  }
  return summary;
}

/** Enqueues one job per shop; the dedupe key makes a repeated cron firing a no-op. */
export async function enqueueForAllShops(db: Db, kind: string, dedupeKey: (shopId: ShopId) => string): Promise<number> {
  const shopIds = await withContext(db, { role: 'sa_worker' }, async (tx) =>
    rowsOf<{ id: string }>(await tx.execute(sql`select id from app_ctx.active_shop_ids() as id`)).map((r) => asShopId(r.id)),
  );
  for (const shopId of shopIds) {
    await withShopContext(db, { role: 'sa_worker', shopId }, (tx) => enqueueJob(tx, { kind, shopId, dedupeKey: dedupeKey(shopId) }));
  }
  return shopIds.length;
}
