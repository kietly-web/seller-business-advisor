# ADR-005 Claude (Anthropic) as the LLM provider

Status: Accepted · 2026-11-04 · Resolves discovery open question Q-T1 (provider); processing location remains open as Q-T2

## Context

The LLM phrases recommendation cards in Vietnamese and will later power a constrained ask-your-data chat. It needs reliable structured output, good Vietnamese, and terms that don't allow training on customer data.

## Decision

- Use Claude through the official TypeScript SDK (`@anthropic-ai/sdk`), behind the `LlmClient` interface in `packages/llm`.
- Default model `claude-opus-5-5` at low effort for explanations. `claude-haiku-5-5` is the documented R7 cost fallback, adopted only if the golden set and a human review show equal quality.
- Use structured outputs for the explain call and strict tool schemas for chat query selection.
- Model IDs live in env config.

## Consequences

- Anthropic joins the sub-processor register. Processing location, retention and the no-training terms must be confirmed and published before beta (Q-T2).
- Expected cost is cents per shop per month at MVP volume, tracked per call in `llm_call`.
- `TemplateLlmClient` keeps the product working without the API (outage, refusal, local dev).

## Alternatives considered

- OpenAI, Google Gemini: viable; switching later is an adapter change behind `LlmClient`.
- Self-hosted open model: more operations work, and weaker Vietnamese quality for the size.
