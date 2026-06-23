/*
  app/disputes/actions.ts — Server Actions for the disputes pipeline.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { updateRecord, fetchRecord } from '@/lib/airtable';
import { STAGES } from '@/lib/format';
import { parseCarrierResponse, parserEnabled, type DisputeOutcome } from '@/lib/disputes/response-parser';
import { recordOutcomeLabel } from '@/lib/disputes/outcomes';
import { withAction } from '@/lib/action-handler';

// ── Carrier Response Parser (suggest-only) ──────────────────────
export const parseResponse = withAction(
  'disputes.parseResponse',
  async (log, disputeId: string, emailText: string) => {
    const session = await auth();
    if (session?.user?.role !== 'staff') return { ok: false as const, error: 'Staff access required.' };
    if (!parserEnabled()) return { ok: false as const, error: 'AI parsing is off — set ANTHROPIC_API_KEY to enable.' };
    if (!emailText.trim()) return { ok: false as const, error: 'Paste the carrier reply first.' };

    const dispute = (await fetchRecord('Disputes', disputeId)) as any;
    const suggestion = await parseCarrierResponse({
      emailText,
      disputedAmount: dispute?.['Disputed amount'] ?? null,
      carrier: dispute?.['Carrier (display)'] ?? dispute?.['Carrier'] ?? null,
    });
    if (!suggestion) return { ok: false as const, error: 'No outcome could be parsed.' };
    log.info('carrier response parsed', { disputeId, outcome: suggestion.outcome });
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
    const session = await auth();
    if (session?.user?.role !== 'staff') return { ok: false as const, error: 'Staff access required.' };

    const dispute = (await fetchRecord('Disputes', input.disputeId)) as any;
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
    const fields: Record<string, unknown> = {};

    if (input.outcome === 'won' || input.outcome === 'partial') {
      fields['Status'] = 'Won';
      fields['Recovery amount'] = input.recoveryAmount ?? 0;
      fields['Date resolved'] = today;
    } else if (input.outcome === 'denied') {
      fields['Status'] = 'Closed';
      fields['Recovery amount'] = 0;
      fields['Date resolved'] = today;
    } else if (input.outcome === 'escalated') {
      fields['Status'] = 'Escalated';
      fields['Escalation date'] = today;
    }

    if (input.notes) fields['Resolution notes'] = input.notes;
    if (input.outcome !== 'unclear') {
      fields['Carrier response date'] = today;
      await updateRecord('Disputes', input.disputeId, fields);
    }

    await recordOutcomeLabel({
      disputeId: input.disputeId,
      outcome: input.outcome,
      recoveryAmount: input.recoveryAmount,
      confidence: input.confidence ?? null,
      reasoning: input.notes ?? null,
      sourceText: input.sourceText ?? null,
      appliedBy: session.user?.email ?? null,
      ruleCode,
      carrierScac,
      disputedAmount,
    });

    log.info('dispute outcome applied', {
      disputeId: input.disputeId,
      outcome: input.outcome,
      recoveryAmount: input.recoveryAmount,
    });

    revalidatePath('/engine');
    revalidatePath('/disputes');
    return { ok: true as const };
  },
);

// ── Advance a dispute to the next stage in the pipeline ──────────
export const advanceStage = withAction(
  'disputes.advanceStage',
  async (log, disputeId: string) => {
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
    if (next === 'Won' && !dispute['Recovery amount']) {
      fields['Recovery amount'] = dispute['Disputed amount'] || 0;
    }

    await updateRecord('Disputes', disputeId, fields);
    log.info('dispute stage advanced', { disputeId, from: current, to: next });
    revalidatePath('/disputes');
    return { ok: true, newStage: next };
  },
);

// ── Append a note (stored in Resolution notes, timestamped) ──────
export const addDisputeNote = withAction(
  'disputes.addNote',
  async (log, disputeId: string, note: string) => {
    const dispute = await fetchRecord('Disputes', disputeId) as any;
    const existing = dispute['Resolution notes'] || '';
    const today = new Date().toISOString().slice(0, 10);
    const updated = existing
      ? `${existing}\n\n[${today}] ${note}`
      : `[${today}] ${note}`;

    await updateRecord('Disputes', disputeId, { 'Resolution notes': updated });
    revalidatePath('/disputes');
    return { ok: true };
  },
);

// ── Mark carrier responded today (resets the "silent days" clock) ──
export const markCarrierResponded = withAction(
  'disputes.markCarrierResponded',
  async (log, disputeId: string) => {
    await updateRecord('Disputes', disputeId, {
      'Carrier response date': new Date().toISOString().slice(0, 10),
    });
    revalidatePath('/disputes');
    return { ok: true };
  },
);
