import { planRecommendations, renderCard } from '@sa/engine';
import { SCENARIOS } from '@sa/engine/golden';
import type { ExplainCardInput, ExplainInput } from './types';

/** Explain inputs for every golden scenario that produces recommendations. */
export function goldenInputs(): { name: string; input: ExplainInput }[] {
  return SCENARIOS.flatMap((s) => {
    const plan = planRecommendations(s.ctx);
    if (plan.recommendations.length === 0) return [];
    const cards: ExplainCardInput[] = plan.recommendations.map((r, i) => ({
      ref: `r${i + 1}`,
      ruleCode: r.ruleCode,
      actionType: r.actionType,
      confidence: r.confidence,
      facts: r.facts,
      fallback: renderCard(r.ruleCode, r.facts),
    }));
    return [{ name: s.name, input: { category: 'nha_cua_doi_song', cards } }];
  });
}
