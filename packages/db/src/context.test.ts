import type { PGlite } from '@electric-sql/pglite';
import { asShopId, asUserId } from '@sa/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withContext, withShopContext, withUserContext, type Db, type DbRole } from './context';
import { appendAudit } from './repositories/audit';
import { currentConsents, recordConsents } from './repositories/consents';
import { rowsOf } from './repositories/rows';
import { createShop, listMyShops, renameShop } from './repositories/shops';
import { auditLog, sku } from './schema';
import { createTestDb } from './testing/pglite';

const OWNER_A = asUserId('owner-a');
const OWNER_B = asUserId('owner-b');

let client: PGlite;
let db: Db;
let shopA: ReturnType<typeof asShopId>;
let shopB: ReturnType<typeof asShopId>;

beforeAll(async () => {
  const test = await createTestDb();
  client = test.client;
  db = test.db;
  shopA = await withUserContext(db, OWNER_A, (tx) => createShop(tx, { name: 'Shop A', category: 'home', isDemo: false }));
  shopB = await withUserContext(db, OWNER_B, (tx) => createShop(tx, { name: 'Shop B', category: null, isDemo: false }));
  await withShopContext(db, { role: 'sa_app', shopId: shopA, userId: OWNER_A }, (tx) =>
    tx.insert(sku).values({ shopId: shopA, name: 'Kệ gia vị 3 tầng' }),
  );
  await withShopContext(db, { role: 'sa_app', shopId: shopB, userId: OWNER_B }, (tx) =>
    tx.insert(sku).values({ shopId: shopB, name: 'Giá treo khăn' }),
  );
});

afterAll(async () => {
  await client.close();
});

describe('withShopContext', () => {
  it('scopes reads to the context shop', async () => {
    const rows = await withShopContext(db, { role: 'sa_app', shopId: shopA, userId: OWNER_A }, (tx) =>
      tx.select({ name: sku.name }).from(sku),
    );
    expect(rows).toEqual([{ name: 'Kệ gia vị 3 tầng' }]);
  });

  it('returns nothing for a shop the user does not belong to', async () => {
    const rows = await withShopContext(db, { role: 'sa_app', shopId: shopB, userId: OWNER_A }, (tx) =>
      tx.select().from(sku),
    );
    expect(rows).toEqual([]);
  });

  it('runs the worker scoped to the job shop', async () => {
    const rows = await withShopContext(db, { role: 'sa_worker', shopId: shopB }, (tx) =>
      tx.select({ name: sku.name }).from(sku),
    );
    expect(rows).toEqual([{ name: 'Giá treo khăn' }]);
  });

  it('leaves no role or setting behind on the connection', async () => {
    await withShopContext(db, { role: 'sa_app', shopId: shopA, userId: OWNER_A }, async () => undefined);
    const after = rowsOf<{ role: string; shop: string }>(
      await db.execute(sql`select current_user as role, current_setting('app.shop_id', true) as shop`),
    );
    expect(after[0]?.role).not.toBe('sa_app');
    expect(after[0]?.shop ?? '').toBe('');
  });

  it('drops the role and settings when the callback throws', async () => {
    await expect(
      withShopContext(db, { role: 'sa_app', shopId: shopA, userId: OWNER_A }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const after = rowsOf<{ shop: string }>(await db.execute(sql`select current_setting('app.shop_id', true) as shop`));
    expect(after[0]?.shop ?? '').toBe('');
  });

  it('refuses a role outside the allowed set', async () => {
    await expect(withContext(db, { role: 'postgres' as DbRole }, async () => undefined)).rejects.toThrow(
      'Unknown database role',
    );
  });
});

describe('shop repository', () => {
  it('lists only the caller’s shops', async () => {
    const shops = await withUserContext(db, OWNER_A, listMyShops);
    expect(shops.map((s) => s.id)).toEqual([shopA]);
  });

  it('renames a shop the caller belongs to', async () => {
    await withShopContext(db, { role: 'sa_app', shopId: shopA, userId: OWNER_A }, (tx) =>
      renameShop(tx, shopA, 'Shop A renamed'),
    );
    const [shop] = await withUserContext(db, OWNER_A, listMyShops);
    expect(shop?.name).toBe('Shop A renamed');
  });
});

describe('consent repository', () => {
  it('returns the latest decision per purpose', async () => {
    const base = { userId: OWNER_A, policyVersion: 'v1', uiTextHash: 'h1', userAgent: null };
    await withUserContext(db, OWNER_A, (tx) =>
      recordConsents(tx, {
        ...base,
        decisions: [
          { purpose: 'service_processing', granted: true },
          { purpose: 'marketing', granted: true },
        ],
      }),
    );
    await withUserContext(db, OWNER_A, (tx) =>
      recordConsents(tx, { ...base, policyVersion: 'v2', decisions: [{ purpose: 'marketing', granted: false }] }),
    );
    const current = await withUserContext(db, OWNER_A, currentConsents);
    expect(current).toEqual({ service_processing: true, marketing: false });
  });

  it('does not show another user’s consents', async () => {
    expect(await withUserContext(db, OWNER_B, currentConsents)).toEqual({});
  });
});

describe('audit repository', () => {
  it('appends an entry as the caller', async () => {
    await withShopContext(db, { role: 'sa_app', shopId: shopA, userId: OWNER_A }, (tx) =>
      appendAudit(tx, { shopId: shopA, actor: OWNER_A, action: 'shop.renamed', entity: 'shop', entityId: shopA }),
    );
    const rows = await withShopContext(db, { role: 'sa_app', shopId: shopA, userId: OWNER_A }, (tx) =>
      tx.select({ action: auditLog.action }).from(auditLog),
    );
    expect(rows).toEqual([{ action: 'shop.renamed' }]);
  });
});
