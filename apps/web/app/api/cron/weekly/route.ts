import { enqueueForAllShops, runDueJobs, workerDb } from '@sa/db';
import { isAuthorizedCron } from '../../../../server/cron-auth';
import { jobHandlers } from '../../../../server/jobs';
import { runWeek } from '../../../../server/weekly-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Vercel Hobby allows one cron a day, so this route both enqueues the weekly runs and drains what it can
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = workerDb();
  const week = runWeek(new Date());
  const shops = await enqueueForAllShops(db, 'recommendations.weekly', (shopId) => `recommendations.weekly:${shopId}:${week}`);
  const summary = await runDueJobs(db, jobHandlers, { workerId: `vercel-weekly-${crypto.randomUUID()}`, limit: 20 });
  return Response.json({ week, shops, ...summary });
}
