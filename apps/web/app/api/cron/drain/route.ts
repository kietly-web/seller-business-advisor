import { runDueJobs, workerDb } from '@sa/db';
import { isAuthorizedCron } from '../../../../server/cron-auth';
import { jobHandlers } from '../../../../server/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const summary = await runDueJobs(workerDb(), jobHandlers, { workerId: `vercel-${crypto.randomUUID()}` });
  return Response.json(summary);
}
