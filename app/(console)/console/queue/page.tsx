/*
  app/queue/page.tsx — Audit Queue (server component).

  Fetches flagged Audit Results from the database, joins in Client
  names, and shapes everything into the flat row format the
  QueueView client component expects (mirrors your design's
  data.js auditResults shape).
*/

import { fetchRecords } from '@/lib/db/records';
import { confidenceFromVariancePct } from '@/lib/format';
import { QueueView, type QueueRow } from '@/components/queue-view';

export const dynamic = 'force-dynamic';
const QUEUE_DISPLAY_LIMIT = 200;

export default async function QueuePage() {
  let rows: QueueRow[] = [];
  let loadError: string | null = null;
  let hasMoreRows = false;

  try {
    const [auditResults, clients] = await Promise.all([
      fetchRecords('Audit Results', {
        filterByFormula: `OR({Outcome} = 'FLAGGED', {Outcome} = 'ERROR')`,
        sort: [{ field: 'Audited at', direction: 'desc' }],
        maxRecords: QUEUE_DISPLAY_LIMIT + 1,
      }),
      fetchRecords('Clients', {
        maxRecords: 100,
        fields: ['Company name'],
      }),
    ]);

    const clientNameMap = new Map<string, string>();
    clients.forEach((c: any) => clientNameMap.set(c.id, c['Company name'] || 'Unknown'));

    hasMoreRows = auditResults.length > QUEUE_DISPLAY_LIMIT;
    rows = auditResults.slice(0, QUEUE_DISPLAY_LIMIT).map((a: any): QueueRow => {
      const billed   = a['Billed amount'] || 0;
      const expected = a['Expected amount'] || 0;
      const recover  = a['Recoverable amount'] ?? Math.max(0, billed - expected);
      const variancePct = expected > 0 ? Math.abs(billed - expected) / expected : 1;

      const clientId = (a['Client'] || [])[0];
      const ruleName = a['Rule name'] || guessRuleFromNotes(a['Notes'] || '');

      return {
        id:         a.id,
        client:     clientId ? (clientNameMap.get(clientId) || 'Unknown') : 'Unknown',
        invoice:    (a['Invoice'] || [])[0] || '',
        carrier:    a['Carrier (display)'] || 'UNKNOWN',
        rule:       ruleName,
        pro:        a['Tracking number'] || '',
        svc:        a['Service level'] || '',
        billed,
        expected,
        recover,
        variance:   variancePct,
        confidence: confidenceFromVariancePct(variancePct),
        status:     mapReviewStatus(a['Review status']),
        deadline:   a['Filing deadline'] || null,
        detected:   (a['Audited at'] || '').slice(0, 10),
        note:       a['Notes'] || '',
        daysLate:   extractDaysLate(a['Notes'] || ''),
      };
    });
  } catch (err: any) {
    loadError = String(err?.message || err);
    console.error('Failed to load audit queue:', err);
  }

  return <QueueView initialRows={rows} loadError={loadError} hasMoreRows={hasMoreRows} />;
}

function mapReviewStatus(status?: string): QueueRow['status'] {
  switch (status) {
    case 'Reviewing': return 'reviewing';
    case 'Approved':  return 'approved';
    case 'Dismissed': return 'dismissed';
    default:          return 'new';
  }
}

function guessRuleFromNotes(notes: string): string {
  if (notes.includes('Divisor:')) return 'DIM_WEIGHT_TRAP';
  if (notes.includes('residential') || notes.includes('Residential')) return 'PHANTOM_ACCESSORIAL';
  if (notes.includes('duplicate') || notes.includes('Duplicate')) return 'DUPLICATE_TRACKING';
  if (notes.includes('business days')) return 'LTL_SLA_FAILURE';
  if (notes.includes('guarantee')) return 'SLA_FAILURE';
  return 'OTHER';
}

function extractDaysLate(notes: string): number | undefined {
  const m = notes.match(/\((\d+)d late/);
  return m ? parseInt(m[1], 10) : undefined;
}
