import type { ExplainInput, ExplainResult, LlmClient } from './types';

export class TemplateLlmClient implements LlmClient {
  async explainRecommendations(input: ExplainInput): Promise<ExplainResult> {
    return { cards: input.cards.map((c) => ({ ref: c.ref, text: c.fallback, source: 'template', failure: null })), call: null };
  }
}
