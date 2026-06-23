/*
  GET /api/run-audit/status?jobId=xxx

  Returns the current status of an audit job.
  Protected: staff session OR INGEST_SECRET.
*/

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getJob } from '@/lib/audit/jobs';
import { withObservability } from '@/lib/api-handler';

export const GET = withObservability('run-audit/status', async (req) => {
  const session = await auth();
  const hasSecret = req.headers.get('x-ingest-secret') === process.env.INGEST_SECRET;
  const isStaff = session?.user?.role === 'staff';

  if (!isStaff && !hasSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job });
});
