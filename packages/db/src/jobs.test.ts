import type { PGlite } from '@electric-sql/pglite';
import { asUserId, type ShopId } from '@sa/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withShopContext, withUserContext, type Db } from './context';
import { claimDueJobs, enqueueJob, runDueJobs, type JobHandler } from './jobs';
import { createShop } from './repositories/shops';
import { sku } from './schema';
import { createTestDb } from './testing/pglite';

const OWNER_A = asUserId('jobs-owner-a');
const OWNER_B = asUserId('jobs-owner-b');

let client: PGlite;
let db: Db;
let shopA: ShopId;
let shopB: ShopId;

async function jobRow(kind: string) {
  const { rows } = await client.query<{
    attempts: number;
    done: boolean;
    last_error: string | null;
    future: boolean;
  }>(
    `select attempts, done_at is not null as done, last_error, run_after > now() as future from app.job where kind = $1`,
    [kind],
  );
  return rows[0];
}

async function makeDue(kind: string) {
  await client.query(`update app.job set run_after = now() - interval '1 second' where kind = $1`, [kind]);
}

beforeAll(async () => {
  ({ client, db } = await createTestDb());
  shopA = await withUserContext(db, OWNER_A, (tx) => createShop(tx, { name: 'A', category: null, isDemo: false }));
  shopB = await withUserContext(db, OWNER_B, (tx) => createShop(tx, { name: 'B', category: null, isDemo: false }));
  await withShopContext(db, { role: 'sa_app', shopId: shopA, userId: OWNER_A }, (tx) =>
    tx.insert(sku).values({ shopId: shopA, name: 'SKU A' }),
  );
  await withShopContext(db, { role: 'sa_app', shopId: shopB, userId: OWNER_B }, (tx) =>
    tx.insert(sku).values({ shopId: shopB, name: 'SKU B' }),
  );
});

beforeEach(async () => {
  await client.exec('delete from app.job');
});

afterAll(async () => {
  await client.close();
});

const enqueueAsA = (kind: string, dedupeKey?: string) =>
  withShopContext(db, { role: 'sa_app', shopId: shopA, userId: OWNER_A }, (tx) =>
    enqueueJob(tx, { kind, shopId: shopA, ...(dedupeKey ? { dedupeKey } : {}) }),
  );

describe('enqueueJob', () => {
  it('ignores a second job with the same dedupe key in the same shop', async () => {
    await enqueueAsA('recompute_metrics', 'recompute:2026-W45');
    await enqueueAsA('recompute_metrics', 'recompute:2026-W45');
    const { rows } = await client.query(`select id from app.job where kind = 'recompute_metrics'`);
    expect(rows).toHaveLength(1);
  });
});

describe('runDueJobs', () => {
  it('runs each handler inside its job shop', async () => {
    await enqueueAsA('list_skus');
    const seen: string[] = [];
    const handlers: Record<string, JobHandler> = {
      list_skus: async (tx) => {
        const rows = await tx.select({ name: sku.name }).from(sku);
        seen.push(...rows.map((r) => r.name));
      },
    };
    const summary = await runDueJobs(db, handlers, { workerId: 'test' });
    expect(summary).toEqual({ claimed: 1, done: 1, retrying: 0, deadLettered: 0 });
    expect(seen).toEqual(['SKU A']);
    expect((await jobRow('list_skus'))?.done).toBe(true);
  });

  it('retries a failing job later with the error recorded', async () => {
    await enqueueAsA('flaky');
    const handlers = { flaky: async () => Promise.reject(new Error('temporary outage')) };
    expect(await runDueJobs(db, handlers, { workerId: 'test' })).toEqual({
      claimed: 1,
      done: 0,
      retrying: 1,
      deadLettered: 0,
    });
    expect(await jobRow('flaky')).toEqual({ attempts: 1, done: false, last_error: 'temporary outage', future: true });
    expect((await runDueJobs(db, handlers, { workerId: 'test' })).claimed).toBe(0);
  });

  it('dead-letters a job after its last attempt and never claims it again', async () => {
    await enqueueAsA('always_fails');
    await client.query(`update app.job set max_attempts = 2 where kind = 'always_fails'`);
    const handlers = { always_fails: async () => Promise.reject(new Error('bad payload')) };
    await runDueJobs(db, handlers, { workerId: 'test' });
    await makeDue('always_fails');
    const second = await runDueJobs(db, handlers, { workerId: 'test' });
    expect(second.deadLettered).toBe(1);
    await makeDue('always_fails');
    expect((await runDueJobs(db, handlers, { workerId: 'test' })).claimed).toBe(0);
  });

  it('fails a job whose kind has no handler', async () => {
    await enqueueAsA('unknown_kind');
    await runDueJobs(db, {}, { workerId: 'test' });
    expect((await jobRow('unknown_kind'))?.last_error).toBe('No handler for job kind "unknown_kind"');
  });

  it('does not claim a job another worker locked recently', async () => {
    await enqueueAsA('locked');
    expect(await claimDueJobs(db, 'worker-1', 10)).toHaveLength(1);
    expect(await claimDueJobs(db, 'worker-2', 10)).toHaveLength(0);
    await client.query(`update app.job set locked_at = now() - interval '6 minutes' where kind = 'locked'`);
    expect(await claimDueJobs(db, 'worker-2', 10)).toHaveLength(1);
  });
});
