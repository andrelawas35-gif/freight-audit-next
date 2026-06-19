/*
  app/disputes/actions.ts — Server Actions for the disputes pipeline.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { updateRecord, fetchRecord } from '@/lib/airtable';
import { STAGES } from '@/lib/format';

// ── Advance a dispute to the next stage in the pipeline ──────────
// Open → In review → Submitted → Escalated → Won → Closed
// Sets the relevant date field automatically based on the new stage.
export async function advanceStage(disputeId: string) {
  const dispute = await fetchRecord('Disputes', disputeId) as any;
  const current = dispute['Status'] || 'Open';
  const idx = STAGES.indexOf(current);
  if (idx === -1 || idx >= STAGES.length - 1) return { ok: false, reason: 'Already at final stage' };

  const next = STAGES[idx + 1];
  const today = new Date().toISOString().slice(0, 10);

  const fields: Record<string, unknown> = { 'Status': next };
  if (next === 'Submitted') fields['Filed date'] = today;
  if (next === 'Escalated') fields['Escalation date'] = today;
  if (next === 'Won' || next === 'Closed') fields['Date resolved'] = today;
  // When marking Won, default recovery amount to disputed amount unless already set
  if (next === 'Won' && !dispute['Recovery amount']) {
    fields['Recovery amount'] = dispute['Disputed amount'] || 0;
  }

  await updateRecord('Disputes', disputeId, fields);
  revalidatePath('/disputes');
  return { ok: true, newStage: next };
}

// ── Append a note (stored in Resolution notes, timestamped) ──────
export async function addDisputeNote(disputeId: string, note: string) {
  const dispute = await fetchRecord('Disputes', disputeId) as any;
  const existing = dispute['Resolution notes'] || '';
  const today = new Date().toISOString().slice(0, 10);
  const updated = existing
    ? `${existing}\n\n[${today}] ${note}`
    : `[${today}] ${note}`;

  await updateRecord('Disputes', disputeId, { 'Resolution notes': updated });
  revalidatePath('/disputes');
  return { ok: true };
}

// ── Mark carrier responded today (resets the "silent days" clock) ──
export async function markCarrierResponded(disputeId: string) {
  await updateRecord('Disputes', disputeId, {
    'Carrier response date': new Date().toISOString().slice(0, 10),
  });
  revalidatePath('/disputes');
  return { ok: true };
}
