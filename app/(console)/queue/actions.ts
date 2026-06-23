/*
  app/queue/actions.ts — Server Actions for the audit queue.

  These run on the SERVER when called from client components
  (via onClick handlers). Each one writes to Airtable and
  revalidates the queue page so the UI reflects the change
  without a manual refresh.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { updateRecord, createRecord, fetchRecord } from '@/lib/airtable';
import { withAction } from '@/lib/action-handler';

async function requireStaff() {
  const session = await auth();
  if (session?.user?.role !== 'staff') throw new Error('Staff access required.');
}

// ── Change review status (New / Reviewing / Approved / Dismissed) ──
export const setReviewStatus = withAction(
  'queue.setReviewStatus',
  async (log, auditResultId: string, status: string) => {
    await requireStaff();
    await updateRecord('Audit Results', auditResultId, { 'Review status': status });
    log.info('review status changed', { auditResultId, status });
    revalidatePath('/queue');
    return { ok: true };
  },
);

// ── Dismiss a finding ────────────────────────────────────────────
export const dismissFinding = withAction(
  'queue.dismissFinding',
  async (log, auditResultId: string) => {
    await requireStaff();
    await updateRecord('Audit Results', auditResultId, { 'Review status': 'Dismissed' });
    log.info('finding dismissed', { auditResultId });
    revalidatePath('/queue');
    return { ok: true };
  },
);

// ── File a dispute from an audit result ──────────────────────────
export const fileDispute = withAction(
  'queue.fileDispute',
  async (log, auditResultId: string, opts?: { resolutionNotes?: string }) => {
    await requireStaff();
    const audit = await fetchRecord('Audit Results', auditResultId) as any;

    const invoiceLink = audit['Invoice'] as string[] | undefined;
    const clientLink  = audit['Client'] as string[] | undefined;
    const ruleLink    = audit['Audit Rules'] as string[] | undefined;

    const dispute = await createRecord('Disputes', {
      'Invoice':           invoiceLink || [],
      'Audit result':      [auditResultId],
      'Client':            clientLink || [],
      'Audit rule':        ruleLink || [],
      'Carrier (display)': audit['Carrier (display)'] || '',
      'Tracking number':   audit['Tracking number'] || '',
      'Disputed amount':   audit['Recoverable amount'] || audit['Variance'] || 0,
      'Status':            'Open',
      'Opened date':       new Date().toISOString().slice(0, 10),
      'Resolution notes':  opts?.resolutionNotes || '',
    });

    await updateRecord('Audit Results', auditResultId, { 'Review status': 'Approved' });

    log.info('dispute filed', {
      auditResultId,
      disputeId: dispute.id,
      amount: audit['Recoverable amount'] || audit['Variance'] || 0,
    });

    revalidatePath('/queue');
    revalidatePath('/disputes');
    return { ok: true, disputeId: dispute.id };
  },
);

// ── Bulk file disputes (from multi-select bulk bar) ───────────────
export const fileDisputesBulk = withAction(
  'queue.fileDisputesBulk',
  async (log, auditResultIds: string[]) => {
    await requireStaff();
    const results = [];
    for (const id of auditResultIds) {
      results.push(await fileDispute(id));
    }
    log.info('bulk disputes filed', { count: results.length });
    revalidatePath('/queue');
    revalidatePath('/disputes');
    return { ok: true, count: results.length };
  },
);

// ── Bulk dismiss ───────────────────────────────────────────────────
export const dismissBulk = withAction(
  'queue.dismissBulk',
  async (log, auditResultIds: string[]) => {
    await requireStaff();
    for (let i = 0; i < auditResultIds.length; i += 10) {
      const batch = auditResultIds.slice(i, i + 10);
      await Promise.all(batch.map(id =>
        updateRecord('Audit Results', id, { 'Review status': 'Dismissed' })
      ));
    }
    log.info('bulk findings dismissed', { count: auditResultIds.length });
    revalidatePath('/queue');
    return { ok: true };
  },
);

// ── Bulk mark approved (without filing — for "ready to file" staging) ──
export const approveBulk = withAction(
  'queue.approveBulk',
  async (log, auditResultIds: string[]) => {
    await requireStaff();
    for (let i = 0; i < auditResultIds.length; i += 10) {
      const batch = auditResultIds.slice(i, i + 10);
      await Promise.all(batch.map(id =>
        updateRecord('Audit Results', id, { 'Review status': 'Reviewing' })
      ));
    }
    log.info('bulk findings approved', { count: auditResultIds.length });
    revalidatePath('/queue');
    return { ok: true };
  },
);
