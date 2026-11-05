import { listActiveShopIds, withShopContext, workerDb } from '@sa/db';
import { isAuthorizedCron } from '../../../../server/cron-auth';
import { explainForShop } from '../../../../server/llm';
import { runRecommendations } from '../../../../server/weekly-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;

// Vercel Hobby allows one cron a day. Each shop runs in short transactions with the model call between them;
// shops not reached within the time budget run on the next firing (a weekly run per shop and week is deduplicated)
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const started = Date.now();
  const db = workerDb();
  const shops = await listActiveShopIds(db);
  const summary = { shops: shops.length, ran: 0, skipped: 0, failed: 0, notReached: 0 };
  for (const shopId of shops) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      summary.notReached++;
      continue;
    }
    try {
      const outcome = await runRecommendations((fn) => withShopContext(db, { role: 'sa_worker', shopId }, fn), shopId, {
        trigger: 'weekly',
        now: new Date(),
        explain: explainForShop(db, shopId),
      });
      if (outcome.ok) summary.ran++;
      else summary.skipped++;
    } catch (error) {
      summary.failed++;
      console.error(`[weekly] run failed shop=${shopId}: ${error instanceof Error ? error.constructor.name : 'unknown'}`);
    }
  }
  return Response.json(summary);
}
