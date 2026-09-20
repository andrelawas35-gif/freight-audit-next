/*
  POST /api/run-audit/process

  Claims the next queued audit job and executes it. Call this from:
    - Vercel Cron (every 1 minute)
    - External scheduler (AWS EventBridge, GitHub Actions)
    - Manual trigger after enqueuing

  Protected by INGEST_SECRET (cron/automation only).
  Returns { ok: true, processed: true, jobId } if a job was claimed,
  or { ok: true, processed: false } if the queue was empty.

  Also expires stale running jobs (>15 min) before claiming.
*/

import { NextResponse } from 'next/server';
import { claimNextJob, completeJob, failJob, expireStaleJobs } from '@/lib/audit/jobs';
import { runAudit } from '@/lib/audit/engine';
import { runThreePLAudit } from '@/lib/audit/3pl-engine';
import { recordRun } from '@/lib/audit/runs';
import { annotateOpenExceptions } from '@/lib/ingestion/data-clerk';
import { runSftpFetch } from '@/lib/ingestion/sftp/fetch';
import { withObservability } from '@/lib/api-handler';

export const maxDuration = 300;

export const POST = withObservability('run-audit/process', async (req, { log }) => {
  const ingestSecret = req.headers.get('x-ingest-secret') === process.env.INGEST_SECRET;
  const cronSecret = process.env.CRON_SECRET
    && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;

  if (!ingestSecret && !cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await expireStaleJobs(15);

  const job = await claimNextJob();
  if (!job) {
    return NextResponse.json({ ok: true, processed: false });
  }

  log.info('job claimed', { jobId: job.id, jobType: job.job_type, clientId: job.client_id });

  try {
    let summary: unknown;
    let runId: string | undefined;
    const runStartedAt = job.started_at ?? new Date().toISOString();

    if (job.job_type === 'sftp_fetch') {
      summary = await runSftpFetch();
    } else if (job.job_type === 'data_clerk') {
      const annotated = await annotateOpenExceptions();
      summary = { annotated };
    } else if (job.job_type === '3pl') {
      summary = await runThreePLAudit({
        clientId: job.client_id ?? undefined,
        cycle: job.cycle ?? undefined,
        triggeredBy: job.triggered_by,
        runStartedAt,
      });
    } else {
      const result = await runAudit({
        clientId: job.client_id ?? undefined,
        dryRun: job.dry_run,
        runStartedAt,
      });

      if (!job.dry_run) {
        const run = await recordRun({
          clientId: job.client_id,
          clientName: null,
          dryRun: job.dry_run,
          status: result.errors.length > 0 ? 'error' : 'success',
          invoicesChecked: result.invoicesChecked,
          findingsCreated: result.findingsCreated,
          totalVariance: result.totalVariance,
          errors: result.errors,
          triggeredBy: job.triggered_by,
        });
        runId = run.id;
      }
      summary = result;
    }

    await completeJob(job.id, { runId, summary });
    log.info('job completed', { jobId: job.id, jobType: job.job_type });
    return NextResponse.json({ ok: true, processed: true, jobId: job.id, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(job.id, message);
    log.error('job failed', { jobId: job.id, jobType: job.job_type, err: err as Error });
    return NextResponse.json({ ok: true, processed: true, jobId: job.id, failed: true, error: message });
  }
});
