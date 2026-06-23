/*
  GET /api/cron/sftp-fetch

  Called by Vercel Cron every 15 minutes. Enqueues an sftp_fetch job
  if one isn't already queued/running. The actual SFTP work happens
  in /api/run-audit/process when the job is claimed.

  Protected by CRON_SECRET (Bearer token from Vercel Cron).
*/

import { NextResponse } from 'next/server';
import { enqueueAudit } from '@/lib/audit/jobs';
import { withObservability } from '@/lib/api-handler';

export const GET = withObservability('cron/sftp-fetch', async (req, { log }) => {
  const cronSecret = process.env.CRON_SECRET
    && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;

  if (!cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const job = await enqueueAudit({ jobType: 'sftp_fetch', triggeredBy: 'cron' });
    log.info('SFTP fetch job enqueued', { jobId: job.id });
    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('already')) {
      return NextResponse.json({ ok: true, skipped: true, reason: message });
    }
    throw err;
  }
});
