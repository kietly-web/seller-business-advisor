import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { buildExplainPayload } from './payload';
import { costUsd, type Usage } from './pricing';
import { EXPLAIN_V1 } from './prompts/explain.v1';
import type { CallValidation, ExplainedCard, ExplainInput, ExplainResult, LlmClient } from './types';
import { checkCard, explainOutput, fillCard, type OutputCard } from './validate';

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export interface ParsedReply {
  model: string;
  stop_reason: string | null;
  parsed_output: { cards: OutputCard[] } | null;
  usage: Usage;
}

export type SendFn = (request: ExplainRequest) => Promise<ParsedReply>;

export function explainRequest(model: string, payloadJson: string) {
  return {
    model,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default' as const,
    output_config: { effort: 'low' as const, format: betaZodOutputFormat(explainOutput) },
    system: [{ type: 'text' as const, text: EXPLAIN_V1.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: payloadJson }],
  };
}

export type ExplainRequest = ReturnType<typeof explainRequest>;

export interface ClaudeClientOptions {
  model: string;
  apiKey?: string;
  send?: SendFn;
  now?: () => number;
}

export class ClaudeLlmClient implements LlmClient {
  private readonly send: SendFn;
  private readonly now: () => number;

  constructor(private readonly options: ClaudeClientOptions) {
    this.now = options.now ?? (() => performance.now());
    if (options.send) {
      this.send = options.send;
    } else {
      const client = new Anthropic({ apiKey: options.apiKey, timeout: 30_000, maxRetries: 2 });
      this.send = async (request) => {
        const reply = await client.beta.messages.parse(request);
        return { model: reply.model, stop_reason: reply.stop_reason, parsed_output: reply.parsed_output, usage: reply.usage };
      };
    }
  }

  async explainRecommendations(input: ExplainInput): Promise<ExplainResult> {
    const allTemplate = (validation: CallValidation, extra: Partial<ExplainResult['call']> = {}): ExplainResult => ({
      cards: input.cards.map((c) => ({ ref: c.ref, text: c.fallback, source: 'template', failure: null })),
      call: {
        purpose: 'explain',
        model: this.options.model,
        promptVersion: EXPLAIN_V1.version,
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        latencyMs: 0,
        costUsd: null,
        validation,
        fallbackCards: input.cards.length,
        ...extra,
      },
    });
    if (input.cards.length === 0) return { cards: [], call: null };

    const started = this.now();
    let reply: ParsedReply;
    try {
      reply = await this.send(explainRequest(this.options.model, JSON.stringify(buildExplainPayload(input))));
    } catch (error) {
      // Error messages can echo request content, so only the class name is logged
      console.error(`[llm] explain failed: ${error instanceof Error ? error.constructor.name : 'unknown'}`);
      return allTemplate('error', { latencyMs: Math.round(this.now() - started) });
    }
    const usageLog = {
      model: reply.model,
      latencyMs: Math.round(this.now() - started),
      inputTokens: reply.usage.input_tokens,
      outputTokens: reply.usage.output_tokens,
      cacheReadTokens: reply.usage.cache_read_input_tokens ?? 0,
      costUsd: costUsd(reply.model, reply.usage),
    };
    if (reply.stop_reason === 'refusal') return allTemplate('refused', usageLog);
    if (reply.stop_reason !== 'end_turn' || !reply.parsed_output) return allTemplate('failed_schema', usageLog);

    const byRef = new Map<string, OutputCard>();
    for (const card of reply.parsed_output.cards) if (!byRef.has(card.ref)) byRef.set(card.ref, card);
    const cards: ExplainedCard[] = input.cards.map((c) => {
      const out = byRef.get(c.ref);
      const failure = out ? checkCard(out, c) : 'missing';
      return failure || !out
        ? { ref: c.ref, text: c.fallback, source: 'template', failure }
        : { ref: c.ref, text: fillCard(out, c.facts), source: 'llm', failure: null };
    });
    const fallbackCards = cards.filter((c) => c.source === 'template').length;
    return {
      cards,
      call: {
        purpose: 'explain',
        promptVersion: EXPLAIN_V1.version,
        ...usageLog,
        validation: fallbackCards === 0 ? 'passed' : 'failed_placeholder',
        fallbackCards,
      },
    };
  }
}
