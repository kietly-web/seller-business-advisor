import { ClaudeLlmClient, TemplateLlmClient, type LlmClient } from '@sa/llm';

export type LlmEnv = Partial<Record<'ANTHROPIC_API_KEY' | 'LLM_MODEL_EXPLAIN', string>>;

// Without a key and a model the product still works: every card uses its static template (ADR-005)
export function llmClientFromEnv(env: LlmEnv): { client: LlmClient; mode: 'claude' | 'template' } {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  const model = env.LLM_MODEL_EXPLAIN?.trim();
  if (!apiKey || !model) {
    return { client: new TemplateLlmClient(), mode: 'template' };
  }
  return { client: new ClaudeLlmClient({ apiKey, model }), mode: 'claude' };
}
