/*
  app/disputes/page.tsx — Disputes pipeline (server component).

  Fetches Disputes + joins Client names, derives:
    - silentDays: days since last carrier activity (for stages that
      are awaiting a response)
    - events: an audit trail timeline built from the date fields
      already on the record (Opened/Filed/Escalation/Resolved) —
      no separate "events" table needed.

  Shapes everything into the format DisputesView expects.
*/

import { fetchRecords } from '@/lib/airtable';
import { DisputesView, type DisputeRow } from '@/components/disputes-view';
import type { TrailEvent } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';


export default async function DisputesPage() {
  let rows: DisputeRow[] = [];
  let loadError: string | null = null;

  try {
    const [disputes, clients, auditResults] = await Promise.all([
      fetchRecords('Disputes', {
        sort: [{ field: 'Opened date', direction: 'desc' }],
        maxRecords: 200,
      }),
      fetchRecords('Clients', { maxRecords: 100, fields: ['Company name'] }),
      fetchRecords('Audit Results', {
        maxRecords: 200,
        fields: ['Notes', 'Disputes', 'Audited at'],
      }),
    ]);

    const clientNameMap = new Map<string, string>();
    clients.forEach((c: any) => clientNameMap.set(c.id, c['Company name'] || 'Unknown'));

    // Map dispute ID -> originating audit result (for "Why flagged" context)
    const auditByDispute = new Map<string, any>();
    auditResults.forEach((a: any) => {
      (a['Disputes'] || []).forEach((dId: string) => auditByDispute.set(dId, a));
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    rows = disputes.map((d: any): DisputeRow => {
      const stage = d['Status'] || 'Open';
      const clientId = (d['Client'] || [])[0];
      const ruleLink = (d['Audit rule'] || [])[0];
      const audit = auditByDispute.get(d.id);

      // ── derive rule key from audit result notes (same heuristic as queue) ──
      const rule = guessRuleFromNotes(audit?.['Notes'] || '');

      // ── silent days: time since last carrier-side activity ──
      let silentDays = 0;
      if (!['Won', 'Closed'].includes(stage)) {
        const lastActivity = d['Carrier response date'] || d['Filed date'] || d['Opened date'];
        if (lastActivity) {
          const last = new Date(lastActivity + 'T00:00:00');
          silentDays = Math.round((today.getTime() - last.getTime()) / 86400000);
        }
      }

      // ── build audit trail from date fields ──
      const events: TrailEvent[] = [];
      if (d['Opened date']) {
        events.push({
          kind: 'opened', date: d['Opened date'], actor: 'System',
          note: audit?.['Notes']
            ? truncate(audit['Notes'], 140)
            : 'Dispute opened from flagged audit result.',
        });
      }
      if (d['Filed date']) {
        events.push({
          kind: 'filed', date: d['Filed date'], actor: 'Team',
          note: `Filed with carrier. Claim amount: ${fmtUSDsafe(d['Disputed amount'])}.`,
        });
      }
      if (d['Escalation date']) {
        events.push({
          kind: 'escalated', date: d['Escalation date'], actor: 'Team',
          note: d['Escalation reason'] || 'Escalated for follow-up — no response within SLA.',
        });
      }
      if (d['Date resolved']) {
        events.push({
          kind: stage === 'Won' ? 'won' : 'closed',
          date: d['Date resolved'], actor: 'Carrier',
          note: stage === 'Won'
            ? `Recovered ${fmtUSDsafe(d['Recovery amount'])}.`
            : (d['Resolution notes'] || 'Dispute closed.'),
        });
      }
      // sort chronologically
      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return {
        id:          d.id,
        displayId:   d['Dispute ID'] || d.id.slice(0, 8),
        client:      clientId ? (clientNameMap.get(clientId) || 'Unknown') : 'Unknown',
        invoice:     ((d['Invoice'] || [])[0] || '').slice(0, 12),
        pro:         d['Tracking number'] || '',
        carrier:     d['Carrier (display)'] || 'UNKNOWN',
        rule,
        stage,
        amount:      d['Disputed amount'] || 0,
        recovery:    d['Recovery amount'] || 0,
        opened:      d['Opened date'] || '',
        filed:       d['Filed date'] || null,
        resolved:    d['Date resolved'] || null,
        deadline:    null, // dispute-level deadlines aren't tracked separately; filing deadline lives on the audit result
        silentDays,
        owner:       d['Assigned to'] || 'Unassigned',
        events,
        notes:       d['Resolution notes'] || '',
      };
    });
  } catch (err: any) {
    loadError = String(err?.message || err);
    console.error('Failed to load disputes:', err);
  }

  return <DisputesView initialRows={rows} loadError={loadError} />;
}

function guessRuleFromNotes(notes: string): string {
  if (notes.includes('Divisor:')) return 'DIM_WEIGHT_TRAP';
  if (notes.includes('residential') || notes.includes('Residential')) return 'PHANTOM_ACCESSORIAL';
  if (notes.includes('duplicate') || notes.includes('Duplicate')) return 'DUPLICATE_TRACKING';
  if (notes.includes('business days')) return 'LTL_SLA_FAILURE';
  if (notes.includes('guarantee')) return 'SLA_FAILURE';
  return 'OTHER';
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function fmtUSDsafe(n?: number) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
