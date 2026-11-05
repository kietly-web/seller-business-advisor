import type { PGlite } from '@electric-sql/pglite';
import {
  addCompetitorListing,
  addCompetitorObservation,
  createShop,
  decideRecommendation,
  latestRun,
  listCompetitorListings,
  listSkuOptions,
  loadRuleInputs,
  rateRecommendation,
  withShopContext,
  withUserContext,
  type Db,
} from '@sa/db';
import { createTestDb } from '@sa/db/testing';
import { TemplateLlmClient, type ExplainInput } from '@sa/llm';
import { addDays, asIsoDate, asUserId, weekEnd, type ShopId } from '@sa/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemoShop } from './demo-seed';
import { contextFrom, ON_DEMAND_RUNS_PER_DAY, runRecommendations, runWeek } from './weekly-run';

const NOW = new Date('2026-11-05T03:00:00Z');
const USER = 'run-owner';
let client: PGlite;
let db: Db;
let shopId: ShopId;

const inShop = <T>(fn: Parameters<typeof withShopContext<T>>[2]) => withShopContext(db, { role: 'sa_app', shopId, userId: asUserId(USER) }, fn);
const templates = new TemplateLlmClient();
let explainCalls = 0;
const explain = async (input: ExplainInput) => {
  explainCalls++;
  return templates.explainRecommendations(input);
};

beforeAll(async () => {
  ({ client, db } = await createTestDb());
  shopId = await withUserContext(db, asUserId(USER), (tx) => createShop(tx, { name: 'Demo', category: 'nha_cua_doi_song', isDemo: true, settings: { targetMarginPct: 15 } }));
  await seedDemoShop(db, { userId: USER, shopId }, asIsoDate('2026-11-05'));
}, 180_000);

afterAll(async () => {
  await client.close();
});

describe('weekly run', () => {
  it('turns the demo shop into stored, labelled cards with checklists', async () => {
    const outcome = await runRecommendations(inShop, shopId, { trigger: 'on_demand', now: NOW, explain });
    expect(outcome).toMatchObject({ ok: true, status: 'succeeded' });
    const run = await inShop((tx) => latestRun(tx, shopId));
    expect(run?.isoWeek).toBe('2026-W44');
    expect(run?.cards.length).toBeGreaterThan(0);
    expect(run?.cards.length).toBeLessThanOrEqual(5);
    for (const c of run?.cards ?? []) {
      expect(c.textSource).toBe('template');
      expect(c.textVi.checklist.length).toBeGreaterThan(0);
      expect(JSON.stringify(c.textVi)).not.toContain('{{');
      expect(c.skuName).not.toBeNull();
    }
    expect(run?.notes).toMatchObject({ weeksOfHistory: expect.any(Number), skipped: expect.arrayContaining(['no_competitor_data']) });
    expect(explainCalls).toBe(1);
  });

  it('expires unanswered cards when a new run starts, and limits on-demand runs per day', async () => {
    const first = await inShop((tx) => latestRun(tx, shopId));
    for (let i = 1; i < ON_DEMAND_RUNS_PER_DAY; i++) {
      expect((await runRecommendations(inShop, shopId, { trigger: 'on_demand', now: NOW, explain })).ok).toBe(true);
    }
    expect(await runRecommendations(inShop, shopId, { trigger: 'on_demand', now: NOW, explain })).toEqual({ ok: false, error: 'rate_limited' });
    expect((await runRecommendations(inShop, shopId, { trigger: 'weekly', now: NOW, explain })).ok).toBe(true);
    const statuses = await client.transaction(async (t) => {
      await t.query('set local role sa_app');
      await t.query("select set_config('app.shop_id', $1, true), set_config('app.user_id', $2, true)", [shopId, USER]);
      return (await t.query<{ status: string }>('select status from app.recommendation where run_id = $1', [first?.id])).rows;
    });
    expect(statuses.every((s) => s.status === 'expired')).toBe(true);
  });

  it('records decisions only along allowed transitions, with ratings', async () => {
    const run = await inShop((tx) => latestRun(tx, shopId));
    const [a, b] = run?.cards ?? [];
    if (!a || !b) throw new Error('need two cards');
    const decide = (id: string, decision: Parameters<typeof decideRecommendation>[1]['decision']) =>
      inShop((tx) => decideRecommendation(tx, { shopId, recommendationId: id, userId: USER, decision }));
    expect(await decide(a.id, { action: 'accept' })).toBe(true);
    expect(await decide(a.id, { action: 'accept' })).toBe(false);
    expect(await decide(a.id, { action: 'done' })).toBe(true);
    expect(await decide(a.id, { action: 'dismiss', reason: 'other' })).toBe(false);
    expect(await decide(b.id, { action: 'dismiss', reason: 'not_relevant' })).toBe(true);
    expect(await inShop((tx) => rateRecommendation(tx, { shopId, recommendationId: a.id, userId: USER, rating: 4 }))).toBe(true);
    expect(await inShop((tx) => rateRecommendation(tx, { shopId, recommendationId: a.id, userId: USER, rating: 9 }))).toBe(false);
    const after = await inShop((tx) => latestRun(tx, shopId));
    expect(after?.cards.find((c) => c.id === a.id)).toMatchObject({ status: 'done', rating: 4 });
    expect(after?.cards.find((c) => c.id === b.id)).toMatchObject({ status: 'dismissed', dismissReason: 'not_relevant' });
  });

  it('feeds competitor prices from the last 14 days into the price rules', async () => {
    const [sku] = await inShop((tx) => listSkuOptions(tx, shopId));
    if (!sku) throw new Error('no sku');
    const end = weekEnd(runWeek(NOW));
    for (const [url, price, day] of [
      ['https://shopee.vn/a-i.1.1', 150_000n, -2],
      ['https://shopee.vn/b-i.1.2', 170_000n, -5],
      ['https://shopee.vn/c-i.1.3', 90_000n, -30],
    ] as const) {
      const listingId = await inShop((tx) => addCompetitorListing(tx, { shopId, userId: USER, skuId: sku.skuId, url, label: null }));
      await inShop((tx) => addCompetitorObservation(tx, { shopId, listingId, userId: USER, priceVnd: price, observedOn: addDays(end, day), note: null }));
    }
    const inputs = await inShop((tx) =>
      loadRuleInputs(tx, shopId, { week: runWeek(NOW), weekEnd: end, stockAsOf: '2026-11-05', historyFromWeek: '2026-W36', competitorFrom: addDays(end, -13) }),
    );
    expect(contextFrom(inputs, runWeek(NOW)).competitors?.get(sku.skuId)).toEqual({ medianVnd: 160_000n, listings: 2 });
    expect((await inShop((tx) => listCompetitorListings(tx, shopId))).filter((l) => l.latestPriceVnd !== null)).toHaveLength(3);
  });

  it('stores an insufficient-data run for a new shop without calling the model', async () => {
    const fresh = await withUserContext(db, asUserId('fresh-owner'), (tx) => createShop(tx, { name: 'New', category: null, isDemo: false }));
    const freshShop = <T>(fn: Parameters<typeof withShopContext<T>>[2]) => withShopContext(db, { role: 'sa_app', shopId: fresh, userId: asUserId('fresh-owner') }, fn);
    const before = explainCalls;
    expect(await runRecommendations(freshShop, fresh, { trigger: 'on_demand', now: NOW, explain })).toMatchObject({ ok: true, status: 'insufficient_data', cards: 0 });
    expect(explainCalls).toBe(before);
  });

  it('counts parallel and failed attempts toward the on-demand limit, and runs the weekly job once per week', async () => {
    const other = await withUserContext(db, asUserId('race-owner'), (tx) => createShop(tx, { name: 'Race', category: null, isDemo: false }));
    const otherShop = <T>(fn: Parameters<typeof withShopContext<T>>[2]) => withShopContext(db, { role: 'sa_app', shopId: other, userId: asUserId('race-owner') }, fn);
    const failing = async (): Promise<never> => {
      throw new Error('model down');
    };
    await expect(runRecommendations(otherShop, other, { trigger: 'on_demand', now: NOW, explain: failing })).resolves.toMatchObject({ ok: true });
    const results = await Promise.all(Array.from({ length: 4 }, () => runRecommendations(otherShop, other, { trigger: 'on_demand', now: NOW, explain })));
    expect(results.filter((r) => r.ok)).toHaveLength(ON_DEMAND_RUNS_PER_DAY - 1);
    expect((await runRecommendations(otherShop, other, { trigger: 'weekly', now: NOW, explain })).ok).toBe(true);
    expect(await runRecommendations(otherShop, other, { trigger: 'weekly', now: NOW, explain })).toEqual({ ok: false, error: 'already_ran' });
  });

  it('marks a run failed when the model step throws, and keeps showing the last good run', async () => {
    const before = await inShop((tx) => latestRun(tx, shopId));
    const failing = async (): Promise<never> => {
      throw new Error('model down');
    };
    await expect(runRecommendations(inShop, shopId, { trigger: 'weekly', now: new Date('2026-11-12T03:00:00Z'), explain: failing })).rejects.toThrow('model down');
    expect((await inShop((tx) => latestRun(tx, shopId)))?.id).toBe(before?.id);
  });
});

