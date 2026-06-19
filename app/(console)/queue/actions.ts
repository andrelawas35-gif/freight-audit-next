/*
  app/queue/actions.ts — Server Actions for the audit queue.

  These run on the SERVER when called from client components
  (via onClick handlers). Each one writes to Airtable and
  revalidates the queue page so the UI reflects the change
  without a manual refresh.

  This is the "write" half of your app — the part that didn't
  exist before. Reading was already covered by fetchRecords();
  these are the first updateRecord/createRecord calls wired to UI.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { updateRecord, createRecord, fetchRecord } from '@/lib/airtable';

// ── Change review status (New / Reviewing / Approved / Dismissed) ──
export async function setReviewStatus(auditResultId: string, status: string) {
  await updateRecord('Audit Results', auditResultId, {
    'Review status': status,
  });
  revalidatePath('/queue');
  return { ok: true };
}

// ── Dismiss a finding ────────────────────────────────────────────
export async function dismissFinding(auditResultId: string) {
  await updateRecord('Audit Results', auditResultId, {
    'Review status': 'Dismissed',
  });
  revalidatePath('/queue');
  return { ok: true };
}

// ── File a dispute from an audit result ──────────────────────────
// Creates a Disputes record linked back to the Audit Result + Invoice,
// copies over Client/Carrier/Tracking for fast filtering, and marks
// the audit result as Approved.
export async function fileDispute(auditResultId: string, opts?: { resolutionNotes?: string }) {
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

  await updateRecord('Audit Results', auditResultId, {
    'Review status': 'Approved',
  });

  revalidatePath('/queue');
  revalidatePath('/disputes');
  return { ok: true, disputeId: dispute.id };
}

// ── Bulk file disputes (from multi-select bulk bar) ───────────────
export async function fileDisputesBulk(auditResultIds: string[]) {
  const results = [];
  for (const id of auditResultIds) {
    results.push(await fileDispute(id));
  }
  revalidatePath('/queue');
  revalidatePath('/disputes');
  return { ok: true, count: results.length };
}

// ── Bulk dismiss ───────────────────────────────────────────────────
export async function dismissBulk(auditResultIds: string[]) {
  for (let i = 0; i < auditResultIds.length; i += 10) {
    const batch = auditResultIds.slice(i, i + 10);
    await Promise.all(batch.map(id =>
      updateRecord('Audit Results', id, { 'Review status': 'Dismissed' })
    ));
  }
  revalidatePath('/queue');
  return { ok: true };
}

// ── Bulk mark approved (without filing — for "ready to file" staging) ──
export async function approveBulk(auditResultIds: string[]) {
  for (let i = 0; i < auditResultIds.length; i += 10) {
    const batch = auditResultIds.slice(i, i + 10);
    await Promise.all(batch.map(id =>
      updateRecord('Audit Results', id, { 'Review status': 'Reviewing' })
    ));
  }
  revalidatePath('/queue');
  return { ok: true };
}
