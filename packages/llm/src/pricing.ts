// USD per million tokens; re-check against Anthropic's pricing page when a model changes (06: track real cost in llm_call)
const PRICES: Readonly<Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costUsd(model: string, usage: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const total =
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite;
  return Math.round(total) / 1e6;
}
