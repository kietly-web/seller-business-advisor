import type { JobHandler } from '@sa/db';
import { explainInJob } from './llm';
import { recomputeInTx } from './metrics';
import { runRecommendations } from './weekly-run';

export const jobHandlers: Readonly<Record<string, JobHandler>> = {
  'metrics.recompute': async (tx, job) => {
    if (job.shopId) {
      await recomputeInTx(tx, job.shopId);
    }
  },
  'recommendations.weekly': async (tx, job) => {
    if (job.shopId) {
      await runRecommendations((fn) => fn(tx), job.shopId, { trigger: 'weekly', now: new Date(), explain: explainInJob(tx, job.shopId) });
    }
  },
};
