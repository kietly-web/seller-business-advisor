import { describe, expect, it } from 'vitest';
import { llmClientFromEnv } from './llm-config';

describe('llmClientFromEnv', () => {
  it('uses templates unless both the key and the model are set', () => {
    expect(llmClientFromEnv({}).mode).toBe('template');
    expect(llmClientFromEnv({ ANTHROPIC_API_KEY: 'k' }).mode).toBe('template');
    expect(llmClientFromEnv({ LLM_MODEL_EXPLAIN: 'claude-opus-5-5' }).mode).toBe('template');
    expect(llmClientFromEnv({ ANTHROPIC_API_KEY: ' ', LLM_MODEL_EXPLAIN: 'claude-opus-5-5' }).mode).toBe('template');
    expect(llmClientFromEnv({ ANTHROPIC_API_KEY: 'k', LLM_MODEL_EXPLAIN: 'claude-opus-5-5' }).mode).toBe('claude');
  });
});
