import type { ShopId } from '@sa/shared';
import type { Tx } from '../context';
import { llmCall } from '../schema';

export interface LlmCallRecord {
  shopId: ShopId | null;
  purpose: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  latencyMs: number;
  costUsd: number | null;
  validation: 'passed' | 'failed_placeholder' | 'failed_schema' | 'refused' | 'error';
}

// Metadata only: prompt and response bodies are never stored (06 Robustness)
export async function recordLlmCall(tx: Tx, call: LlmCallRecord): Promise<void> {
  await tx.insert(llmCall).values({
    shopId: call.shopId,
    purpose: call.purpose,
    model: call.model,
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    cacheReadTokens: call.cacheReadTokens,
    latencyMs: call.latencyMs,
    costUsd: call.costUsd === null ? null : call.costUsd.toFixed(6),
    validation: call.validation,
  });
}
