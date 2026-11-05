import type { JobHandler } from '@sa/db';
import { recomputeInTx } from './metrics';

export const jobHandlers: Readonly<Record<string, JobHandler>> = {
  'metrics.recompute': async (tx, job) => {
    if (job.shopId) {
      await recomputeInTx(tx, job.shopId);
    }
  },
};
