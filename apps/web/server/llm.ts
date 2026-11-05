import 'server-only';
import { recordLlmCall, withShopContext, type Db } from '@sa/db';
import type { ExplainInput, ExplainResult } from '@sa/llm';
import { asUserId, type ShopId } from '@sa/shared';
import { llmClientFromEnv } from './llm-config';

export async function explainForShop(db: Db, who: { userId?: string; shopId: ShopId }, input: ExplainInput): Promise<ExplainResult> {
  const { client } = llmClientFromEnv({ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, LLM_MODEL_EXPLAIN: process.env.LLM_MODEL_EXPLAIN });
  const result = await client.explainRecommendations(input);
  if (result.call) {
    const call = result.call;
    await withShopContext(db, { role: 'sa_worker', shopId: who.shopId, userId: who.userId ? asUserId(who.userId) : undefined }, (tx) =>
      recordLlmCall(tx, { shopId: who.shopId, ...call }),
    );
  }
  return result;
}
