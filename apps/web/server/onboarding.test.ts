import type { PGlite } from '@electric-sql/pglite';
import { currentConsents, ShopAlreadyExistsError, withUserContext, type Db } from '@sa/db';
import { createTestDb } from '@sa/db/testing';
import { asUserId } from '@sa/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasServiceConsent, recordSignUpConsents, updateOptionalConsents } from './consents';
import { createShopForUser, demoShopInput, parseOnboarding } from './onboarding';

let client: PGlite;
let db: Db;

beforeAll(async () => {
  ({ client, db } = await createTestDb());
});

afterAll(async () => {
  await client.close();
});

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe('parseOnboarding', () => {
  it('accepts a complete form', () => {
    expect(parseOnboarding(form({ name: ' Shop Lan ', category: 'nha_cua_doi_song', targetMargin: '15' }))).toEqual({
      ok: true,
      value: { name: 'Shop Lan', category: 'nha_cua_doi_song', targetMarginPct: 15 },
    });
  });

  it('reports every invalid field', () => {
    const result = parseOnboarding(form({ name: '', category: 'xe_hoi', targetMargin: '95' }));
    expect(result.ok).toBe(false);
    expect(Object.keys(result.ok ? {} : result.errors).sort()).toEqual(['category', 'name', 'targetMargin']);
  });
});

describe('createShopForUser', () => {
  it('creates the shop with the user as owner, stores the target margin and audits it', async () => {
    const shopId = await createShopForUser(db, 'owner-1', { name: 'Shop Lan', category: 'nha_cua_doi_song', targetMarginPct: 18, isDemo: false });
    const shop = await client.query<{ settings: { targetMarginPct: number }; is_demo: boolean }>(
      `select settings, is_demo from app.shop where id = $1`,
      [shopId],
    );
    expect(shop.rows[0]).toEqual({ settings: { targetMarginPct: 18 }, is_demo: false });
    const member = await client.query(`select user_id, role from app.shop_member where shop_id = $1`, [shopId]);
    expect(member.rows).toEqual([{ user_id: 'owner-1', role: 'owner' }]);
    const audit = await client.query(`select action, actor from app.audit_log where shop_id = $1`, [shopId]);
    expect(audit.rows).toEqual([{ action: 'shop.created', actor: 'owner-1' }]);
  });

  it('refuses a second shop for the same owner', async () => {
    await expect(createShopForUser(db, 'owner-1', demoShopInput())).rejects.toBeInstanceOf(ShopAlreadyExistsError);
  });

  it('marks the demo shop as demo', async () => {
    const shopId = await createShopForUser(db, 'owner-2', demoShopInput());
    const shop = await client.query<{ is_demo: boolean; name: string }>(`select is_demo, name from app.shop where id = $1`, [shopId]);
    expect(shop.rows[0]).toEqual({ is_demo: true, name: 'Shop mẫu' });
  });
});

describe('consent settings', () => {
  it('records only changed optional consents and audits withdrawals', async () => {
    const user = 'consent-user';
    await recordSignUpConsents(db, user, { service_processing: true, anonymised_benchmarking: true, marketing: false }, null);
    const changes = await updateOptionalConsents(db, user, { anonymised_benchmarking: false, marketing: false }, 'test-agent');
    expect(changes).toEqual([{ purpose: 'anonymised_benchmarking', granted: false }]);
    expect(await withUserContext(db, asUserId(user), currentConsents)).toEqual({
      service_processing: true,
      anonymised_benchmarking: false,
      marketing: false,
    });
    const audit = await client.query<{ action: string }>(`select action from app.audit_log where actor = $1 order by id`, [user]);
    expect(audit.rows.map((r) => r.action)).toEqual(['consent.recorded', 'consent.withdrawn']);
  });

  it('never changes the required service consent from settings', async () => {
    const user = 'consent-user-2';
    await recordSignUpConsents(db, user, { service_processing: true, anonymised_benchmarking: false, marketing: false }, null);
    await updateOptionalConsents(db, user, { service_processing: false } as never, null);
    expect((await withUserContext(db, asUserId(user), currentConsents)).service_processing).toBe(true);
  });
});


describe('consent gate', () => {
  it('reports a user without a service consent record as not consented', async () => {
    expect(await hasServiceConsent(db, 'no-record-user')).toBe(false);
    await recordSignUpConsents(db, 'no-record-user', { service_processing: true, anonymised_benchmarking: false, marketing: false }, null);
    expect(await hasServiceConsent(db, 'no-record-user')).toBe(true);
  });
});
