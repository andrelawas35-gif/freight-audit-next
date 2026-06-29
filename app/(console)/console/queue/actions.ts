/*
  app/queue/actions.ts — Server Actions for the audit queue.

  These run on the SERVER when called from client components
  (via onClick handlers). Each one writes to the database and
  revalidates the queue page so the UI reflects the change
  without a manual refresh.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/auth';
import { updateRecord, createRecord, fetchRecord } from '@/lib/db/records';
import { withAction } from '@/lib/action-handler';

const auditResultIdSchema = z
  .string()
  .trim()
  .regex(/^rec[A-Za-z0-9]{14,32}$/, 'Invalid audit result ID.');

const reviewStatusSchema = z.enum(['New', 'Reviewing', 'Approved', 'Dismissed']);

const bulkAuditResultIdsSchema = z
  .array(auditResultIdSchema)
  .min(1, 'Select at least one finding.')
  .max(100, 'Select 100 findings or fewer.')
  .transform((ids) => [...new Set(ids)]);

const fileDisputeOptsSchema = z
  .object({
    resolutionNotes: z.string().trim().max(4000, 'Resolution notes are too long.').optional(),
  })
  .strict()
  .optional();

async function requireStaff() {
  const session = await auth();
  if (session?.user?.role !== 'staff') throw new Error('Staff access required.');
}

function fail(error = 'Invalid request.') {
  return { ok: false as const, error };
}

// ── Change review status (New / Reviewing / Approved / Dismissed) ──
export const setReviewStatus = withAction(
  'queue.setReviewStatus',
  async (log, auditResultId: string, status: string) => {
    await requireStaff();
    const parsed = z.object({
      auditResultId: auditResultIdSchema,
      status: reviewStatusSchema,
    }).safeParse({ auditResultId, status });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    await updateRecord('Audit Results', parsed.data.auditResultId, { 'Review status': parsed.data.status });
    log.info('review status changed', parsed.data);
    revalidatePath('/console/queue');
    return { ok: true };
  },
);

// ── Dismiss a finding ────────────────────────────────────────────
export const dismissFinding = withAction(
  'queue.dismissFinding',
  async (log, auditResultId: string) => {
    await requireStaff();
    const parsed = auditResultIdSchema.safeParse(auditResultId);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    await updateRecord('Audit Results', parsed.data, { 'Review status': 'Dismissed' });
    log.info('finding dismissed', { auditResultId: parsed.data });
    revalidatePath('/console/queue');
    return { ok: true };
  },
);

// ── File a dispute from an audit result ──────────────────────────
export const fileDispute = withAction(
  'queue.fileDispute',
  async (log, auditResultId: string, opts?: { resolutionNotes?: string }) => {
    await requireStaff();
    const parsed = z.object({
      auditResultId: auditResultIdSchema,
      opts: fileDisputeOptsSchema,
    }).safeParse({ auditResultId, opts });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    const dispute = await fileDisputeForAudit(parsed.data.auditResultId, parsed.data.opts?.resolutionNotes);
    log.info('dispute filed', {
      auditResultId: parsed.data.auditResultId,
      disputeId: dispute.id,
      amount: dispute.amount,
    });

    revalidatePath('/console/queue');
    revalidatePath('/console/disputes');
    return { ok: true, disputeId: dispute.id };
  },
);

// ── Bulk file disputes (from multi-select bulk bar) ───────────────
export const fileDisputesBulk = withAction(
  'queue.fileDisputesBulk',
  async (log, auditResultIds: string[]) => {
    await requireStaff();
    const parsed = bulkAuditResultIdsSchema.safeParse(auditResultIds);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    const results = [];
    for (const id of parsed.data) {
      results.push(await fileDisputeForAudit(id));
    }
    log.info('bulk disputes filed', { count: results.length });
    revalidatePath('/console/queue');
    revalidatePath('/console/disputes');
    return { ok: true, count: results.length };
  },
);

// ── Bulk dismiss ───────────────────────────────────────────────────
export const dismissBulk = withAction(
  'queue.dismissBulk',
  async (log, auditResultIds: string[]) => {
    await requireStaff();
    const parsed = bulkAuditResultIdsSchema.safeParse(auditResultIds);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    for (let i = 0; i < parsed.data.length; i += 10) {
      const batch = parsed.data.slice(i, i + 10);
      await Promise.all(batch.map(id =>
        updateRecord('Audit Results', id, { 'Review status': 'Dismissed' })
      ));
    }
    log.info('bulk findings dismissed', { count: parsed.data.length });
    revalidatePath('/console/queue');
    return { ok: true };
  },
);

// ── Bulk mark approved (without filing — for "ready to file" staging) ──
export const approveBulk = withAction(
  'queue.approveBulk',
  async (log, auditResultIds: string[]) => {
    await requireStaff();
    const parsed = bulkAuditResultIdsSchema.safeParse(auditResultIds);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    for (let i = 0; i < parsed.data.length; i += 10) {
      const batch = parsed.data.slice(i, i + 10);
      await Promise.all(batch.map(id =>
        updateRecord('Audit Results', id, { 'Review status': 'Reviewing' })
      ));
    }
    log.info('bulk findings approved', { count: parsed.data.length });
    revalidatePath('/console/queue');
    return { ok: true };
  },
);

async function fileDisputeForAudit(auditResultId: string, resolutionNotes = '') {
  const audit = await fetchRecord('Audit Results', auditResultId) as any;

  const invoiceLink = audit['Invoice'] as string[] | undefined;
  const clientLink  = audit['Client'] as string[] | undefined;
  const ruleLink    = audit['Audit Rules'] as string[] | undefined;
  const amount = audit['Recoverable amount'] || audit['Variance'] || 0;

  const dispute = await createRecord('Disputes', {
    'Invoice':           invoiceLink || [],
    'Audit result':      [auditResultId],
    'Client':            clientLink || [],
    'Audit rule':        ruleLink || [],
    'Carrier (display)': audit['Carrier (display)'] || '',
    'Tracking number':   audit['Tracking number'] || '',
    'Disputed amount':   amount,
    'Status':            'pending_review',
    'Opened date':       new Date().toISOString().slice(0, 10),
    'Resolution notes':  resolutionNotes,
  });

  await updateRecord('Audit Results', auditResultId, { 'Review status': 'Approved' });
  return { id: dispute.id, amount };
}
