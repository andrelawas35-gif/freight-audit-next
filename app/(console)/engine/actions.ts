/*
  app/(console)/engine/actions.ts — enqueue audit jobs from the console.
  Returns a jobId immediately; the UI polls /api/run-audit/status for progress.
*/

'use server';

import { auth } from '@/auth';
import { enqueueAudit } from '@/lib/audit/jobs';
import { log, withCorrelationId, generateCorrelationId } from '@/lib/logger';

export type EnqueueResult = {
  ok: boolean;
  jobId?: string;
  error?: string;
};

export async function triggerAudit(
  _prev: EnqueueResult | undefined,
  formData: FormData
): Promise<EnqueueResult> {
  return withCorrelationId(generateCorrelationId(), async () => {
    const session = await auth();
    if (session?.user?.role !== 'staff') {
      return { ok: false, error: 'Staff access required.' };
    }

    const clientIdRaw = String(formData.get('clientId') || '').trim();
    const clientId = clientIdRaw || undefined;
    const dryRun = formData.get('dryRun') === 'on';
    const jobType = (formData.get('jobType') as 'parcel' | '3pl' | 'sftp_fetch' | 'data_clerk') || 'parcel';

    try {
      const job = await enqueueAudit({
        jobType,
        clientId,
        dryRun,
        triggeredBy: session.user?.email ?? 'staff',
      });

      log.info('audit job enqueued from console', { jobId: job.id, jobType, clientId, dryRun });
      return { ok: true, jobId: job.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('audit enqueue failed', { err: err as Error, jobType, clientId });
      return { ok: false, error: message };
    }
  });
}
