/*
  app/disputes/actions.ts — Server Actions for the disputes pipeline.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/auth';
import { updateRecord, fetchRecord } from '@/lib/db/records';
import { validateTransition, type DisputeStatus } from '@/lib/disputes/state-machine';
import { parseCarrierResponse, parserEnabled, type DisputeOutcome } from '@/lib/disputes/response-parser';
import { recordOutcomeLabel } from '@/lib/disputes/outcomes';
import { withAction } from '@/lib/action-handler';

const recordIdSchema = z
  .string()
  .trim()
  .regex(/^rec[A-Za-z0-9]{14,32}$/, 'Invalid dispute ID.');

const parseResponseSchema = z.object({
  disputeId: recordIdSchema,
  emailText: z.string().trim().min(1, 'Paste the carrier reply first.').max(20000, 'Carrier reply is too long.'),
});

const disputeOutcomeSchema = z.enum(['won', 'partial', 'denied', 'escalated', 'unclear']);

const applyOutcomeSchema = z.object({
  disputeId: recordIdSchema,
  outcome: disputeOutcomeSchema,
  recoveryAmount: z.number().finite().nonnegative('Recovery amount must be zero or greater.').nullable(),
  notes: z.string().trim().max(4000, 'Notes are too long.').optional(),
  sourceText: z.string().trim().max(20000, 'Source text is too long.').optional(),
  confidence: z.number().finite().min(0).max(100).optional(),
});

const noteSchema = z.object({
  disputeId: recordIdSchema,
  note: z.string().trim().min(1, 'Enter a note.').max(4000, 'Note is too long.'),
});

async function requireStaff() {
  const session = await auth();
  if (session?.user?.role !== 'staff') return null;
  return session;
}

function fail(error = 'Invalid request.') {
  return { ok: false as const, error };
}

// ── Carrier Response Parser (suggest-only) ──────────────────────
export const parseResponse = withAction(
  'disputes.parseResponse',
  async (log, disputeId: string, emailText: string) => {
    const session = await requireStaff();
    if (!session) return fail('Staff access required.');
    const parsed = parseResponseSchema.safeParse({ disputeId, emailText });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);
    if (!parserEnabled()) return { ok: false as const, error: 'AI parsing is off — set ANTHROPIC_API_KEY to enable.' };
    const dispute = (await fetchRecord('Disputes', parsed.data.disputeId)) as any;
    const suggestion = await parseCarrierResponse({
      emailText: parsed.data.emailText,
      disputedAmount: dispute?.['Disputed amount'] ?? null,
      carrier: dispute?.['Carrier (display)'] ?? dispute?.['Carrier'] ?? null,
    });
    if (!suggestion) return { ok: false as const, error: 'No outcome could be parsed.' };
    log.info('carrier response parsed', { disputeId: parsed.data.disputeId, outcome: suggestion.outcome });
    return { ok: true as const, ...suggestion };
  },
);

// Apply a reviewed outcome to the dispute + record the label for learning.
export const applyOutcome = withAction(
  'disputes.applyOutcome',
  async (log, input: {
    disputeId: string;
    outcome: DisputeOutcome;
    recoveryAmount: number | null;
    notes?: string;
    sourceText?: string;
    confidence?: number;
  }) => {
    const session = await requireStaff();
    if (!session) return fail('Staff access required.');
    const parsed = applyOutcomeSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);
    const data = parsed.data;

    const dispute = (await fetchRecord('Disputes', data.disputeId)) as any;
    const disputedAmount: number | null = dispute?.['Disputed amount'] ?? null;
    let ruleCode: string | null = null;
    let carrierScac: string | null = dispute?.['Carrier (display)'] ?? null;
    const auditResultId = (dispute?.['Audit result'] || [])[0];
    if (auditResultId) {
      try {
        const ar = (await fetchRecord('Audit Results', auditResultId)) as any;
        ruleCode = ar?.['Detected by'] ?? null;
        carrierScac = ar?.['Carrier SCAC'] ?? carrierScac;
      } catch {
        /* dispute may not have an originating audit result (manual) */
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const currentStatus = dispute['Status'] || 'pending_review';
    const fields: Record<string, unknown> = {};
    let newStatus: DisputeStatus | null = null;

    if (data.outcome === 'won') {
      newStatus = 'won';
      fields['Recovery amount'] = data.recoveryAmount ?? 0;
      fields['Date resolved'] = today;
    } else if (data.outcome === 'partial') {
      newStatus = 'partial';
      fields['Recovery amount'] = data.recoveryAmount ?? 0;
      fields['Date resolved'] = today;
    } else if (data.outcome === 'denied') {
      newStatus = 'dismissed';
      fields['Recovery amount'] = 0;
      fields['Date resolved'] = today;
    } else if (data.outcome === 'escalated') {
      newStatus = 'appealed';
      fields['Escalation date'] = today;
    }

    if (newStatus) {
      try {
        validateTransition(currentStatus as DisputeStatus, newStatus);
      } catch (err) {
        return fail((err as Error).message);
      }
      fields['Status'] = newStatus;
    }

    if (data.notes) fields['Resolution notes'] = data.notes;
    if (data.outcome !== 'unclear') {
      fields['Carrier response date'] = today;
      const actor = session.user?.email ?? 'unknown';
      await updateRecord('Disputes', data.disputeId, fields, actor);
    }

    await recordOutcomeLabel({
      disputeId: data.disputeId,
      outcome: data.outcome,
      recoveryAmount: data.recoveryAmount,
      confidence: data.confidence ?? null,
      reasoning: data.notes ?? null,
      sourceText: data.sourceText ?? null,
      appliedBy: session.user?.email ?? null,
      ruleCode,
      carrierScac,
      disputedAmount,
    });

    log.info('dispute outcome applied', {
      disputeId: data.disputeId,
      outcome: data.outcome,
      recoveryAmount: data.recoveryAmount,
    });

    revalidatePath('/console/engine');
    revalidatePath('/console/disputes');
    return { ok: true as const };
  },
);

// Canonical pipeline for linear advance (ADR 0005)
const ADVANCE_PIPELINE: DisputeStatus[] = ['pending_review', 'filed', 'carrier_responded', 'won', 'closed'];

// ── Advance a dispute to the next stage in the pipeline ──────────
export const advanceStage = withAction(
  'disputes.advanceStage',
  async (log, disputeId: string) => {
    const session = await requireStaff();
    if (!session) return fail('Staff access required.');
    const parsed = recordIdSchema.safeParse(disputeId);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    const dispute = await fetchRecord('Disputes', parsed.data) as any;
    const current = (dispute['Status'] || 'pending_review') as DisputeStatus;
    const idx = ADVANCE_PIPELINE.indexOf(current);
    if (idx === -1) return { ok: false, error: `Dispute status "${current}" is not in the advance pipeline.` };
    if (idx >= ADVANCE_PIPELINE.length - 1) return { ok: false, error: 'Already at the final stage.' };

    const next = ADVANCE_PIPELINE[idx + 1];

    try {
      validateTransition(current, next);
    } catch (err) {
      return fail((err as Error).message);
    }

    const today = new Date().toISOString().slice(0, 10);
    const fields: Record<string, unknown> = { Status: next };

    if (next === 'filed') fields['Filed date'] = today;
    if (next === 'appealed') fields['Escalation date'] = today;
    if (next === 'won' || next === 'closed') fields['Date resolved'] = today;
    if (next === 'won' && !dispute['Recovery amount']) {
      fields['Recovery amount'] = dispute['Disputed amount'] || 0;
    }

    const actor = session.user?.email ?? 'unknown';
    await updateRecord('Disputes', parsed.data, fields, actor);
    log.info('dispute stage advanced', { disputeId: parsed.data, from: current, to: next });
    revalidatePath('/console/disputes');
    return { ok: true, newStage: next };
  },
);

// ── Append a note (stored in Resolution notes, timestamped) ──────
export const addDisputeNote = withAction(
  'disputes.addNote',
  async (log, disputeId: string, note: string) => {
    const session = await requireStaff();
    if (!session) return fail('Staff access required.');
    const parsed = noteSchema.safeParse({ disputeId, note });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    const dispute = await fetchRecord('Disputes', parsed.data.disputeId) as any;
    const existing = dispute['Resolution notes'] || '';
    const today = new Date().toISOString().slice(0, 10);
    const updated = existing
      ? `${existing}\n\n[${today}] ${parsed.data.note}`
      : `[${today}] ${parsed.data.note}`;

    await updateRecord('Disputes', parsed.data.disputeId, { 'Resolution notes': updated }, session.user?.email ?? 'unknown');
    revalidatePath('/console/disputes');
    return { ok: true };
  },
);

// ── Mark carrier responded today (resets the "silent days" clock) ──
export const markCarrierResponded = withAction(
  'disputes.markCarrierResponded',
  async (log, disputeId: string) => {
    const session = await requireStaff();
    if (!session) return fail('Staff access required.');
    const parsed = recordIdSchema.safeParse(disputeId);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message);

    const actor = session.user?.email ?? 'unknown';
    await updateRecord('Disputes', parsed.data, {
      'Carrier response date': new Date().toISOString().slice(0, 10),
    }, actor);
    revalidatePath('/console/disputes');
    return { ok: true };
  },
);
