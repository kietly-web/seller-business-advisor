import 'server-only';
import { recordLlmCall, withShopContext, type Db, type Tx } from '@sa/db';
import type { ExplainInput, ExplainResult, LlmCallLog } from '@sa/llm';
import type { ShopId } from '@sa/shared';
import { llmClientFromEnv } from './llm-config';

function client() {
  return llmClientFromEnv({ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, LLM_MODEL_EXPLAIN: process.env.LLM_MODEL_EXPLAIN }).client;
}

const record = (tx: Tx, shopId: ShopId, call: LlmCallLog) => recordLlmCall(tx, { shopId, ...call });

/** Explain for a request: the call log is written in its own short worker transaction. */
export function explainForShop(db: Db, shopId: ShopId): (input: ExplainInput) => Promise<ExplainResult> {
  return async (input) => {
    const result = await client().explainRecommendations(input);
    const call = result.call;
    if (call) {
      await withShopContext(db, { role: 'sa_worker', shopId }, (tx) => record(tx, shopId, call));
    }
    return result;
  };
}

