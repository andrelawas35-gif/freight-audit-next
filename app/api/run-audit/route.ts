/*
  POST /api/run-audit
  Enqueues an audit job and returns immediately with a job ID.
  The actual audit runs asynchronously via /api/run-audit/process.

  Body (JSON, all optional):
    { clientId?: string, dryRun?: boolean, jobType?: 'parcel' | '3pl', cycle?: string }

  Returns:
    { ok: true, jobId, status: 'queued' }

  Protected: requires staff session OR valid INGEST_SECRET header.
*/

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { enqueueAudit } from '@/lib/audit/jobs';
import { withObservability } from '@/lib/api-handler';

const bodySchema = z.object({
  clientId: z.string().optional(),
  dryRun: z.boolean().optional(),
  jobType: z.enum(['parcel', '3pl', 'data_clerk', 'sftp_fetch']).optional(),
  cycle: z.string().optional(),
});

export const POST = withObservability('run-audit', async (req, { log }) => {
  const session = await auth();
  const hasSecret = req.headers.get('x-ingest-secret') === process.env.INGEST_SECRET;
  const isStaff = session?.user?.role === 'staff';

  if (!isStaff && !hasSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('invalid audit request', { details: parsed.error.flatten() });
    return NextResponse.json(
      { ok: false, error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { clientId, dryRun, jobType, cycle } = parsed.data;
  const triggeredBy = isStaff ? session!.user!.email ?? 'staff' : 'automation';

  const job = await enqueueAudit({ jobType, clientId, dryRun, triggeredBy, cycle });
  log.info('audit job enqueued', { jobId: job.id, jobType, clientId, triggeredBy });
  return NextResponse.json({ ok: true, jobId: job.id, status: 'queued' });
});
