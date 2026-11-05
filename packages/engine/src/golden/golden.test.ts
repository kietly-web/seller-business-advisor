import { describe, expect, it } from 'vitest';
import { planRecommendations } from '../plan';
import { CHECKLISTS, placeholdersOf, renderCard, TEMPLATES } from '../rules/templates';
import { SCENARIOS } from './scenarios';

describe('golden set', () => {
  it('has at least 20 scenarios', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(20);
  });

  for (const scenario of SCENARIOS) {
    it(scenario.name, () => {
      const plan = planRecommendations(scenario.ctx);
      const e = scenario.expect;
      const key = (c: { ruleCode: string; skuId: string }) => `${c.ruleCode}:${c.skuId}`;
      if (e.status) expect(plan.status).toBe(e.status);
      if (e.count !== undefined) expect(plan.recommendations).toHaveLength(e.count);
      for (const want of e.recommended ?? []) {
        const got = plan.recommendations.find((r) => key(r) === key(want));
        expect(got, `${key(want)} should be recommended`).toBeDefined();
        if (want.rank) expect(got?.rank).toBe(want.rank);
        if (want.actionType) expect(got?.actionType).toBe(want.actionType);
        if (want.facts) expect(got?.facts).toMatchObject(want.facts);
      }
      for (const no of e.absent ?? []) {
        expect(plan.scored.some((c) => key(c) === key(no)), `${key(no)} should not fire`).toBe(false);
      }
      for (const d of e.dropped ?? []) {
        expect(plan.scored.find((c) => key(c) === key(d))?.dropped).toBe(d.reason);
      }
      for (const s of e.skipped ?? []) {
        expect(plan.skipped).toContainEqual(s);
      }
      if (e.missingCosts) expect(plan.missingCosts.map((m) => m.skuId)).toEqual(e.missingCosts);
      if (e.maxPerActionType) {
        const perType = new Map<string, number>();
        for (const r of plan.recommendations) perType.set(r.actionType, (perType.get(r.actionType) ?? 0) + 1);
        expect(Math.max(...perType.values())).toBeLessThanOrEqual(e.maxPerActionType);
      }
      expect(new Set(plan.recommendations.map((r) => r.skuId)).size).toBe(plan.recommendations.length);
      expect(plan.recommendations.length).toBeLessThanOrEqual(5);

      for (const r of plan.recommendations) {
        expect(r.impactLowVnd).toBeLessThanOrEqual(r.impactHighVnd);
        expect(r.impactLowVnd === r.impactHighVnd && r.impactLowVnd !== 0n).toBe(false);
        expect(CHECKLISTS[r.checklistKey as keyof typeof CHECKLISTS], r.checklistKey).toBeDefined();
        for (const field of Object.values(TEMPLATES[r.ruleCode])) {
          for (const p of placeholdersOf(field)) expect(Object.keys(r.facts), `${r.ruleCode} needs ${p}`).toContain(p);
        }
        const card = renderCard(r.ruleCode, r.facts);
        expect(JSON.stringify(card)).not.toContain('{{');
      }
    });
  }
});

describe('templates', () => {
  it('contain no figures outside placeholders', () => {
    for (const t of Object.values(TEMPLATES)) {
      for (const field of Object.values(t)) expect(field.replace(/\{\{[a-z_]+\}\}/g, '')).not.toMatch(/\d/);
    }
  });
});
