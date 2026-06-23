import { auth } from '@/auth';
import { fetchRecords } from '@/lib/airtable';
import { DisputesList } from '@/components/portal/disputes-list';
import type { Dispute, AuditResult } from '@/lib/types';

type PortalDispute = Dispute & {
  'Carrier (display)'?: string;
  'Tracking number'?: string;
};

export const metadata = { title: 'Disputes · Aurelian Collective' };
export const dynamic = 'force-dynamic';

function shortDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const RULE_LABEL: Record<string, string> = {
  DIM_WEIGHT_TRAP: 'Dim-weight overcharge',
  PHANTOM_ACCESSORIAL: 'Invalid residential surcharge',
  DUPLICATE_TRACKING: 'Duplicate charge',
  SLA_FAILURE: 'Late delivery SLA',
  LTL_SLA_FAILURE: 'LTL late delivery',
};

function normalizeRule(raw: string): string {
  const u = (raw || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (u.includes('DIM')) return 'DIM_WEIGHT_TRAP';
  if (u.includes('PHANTOM') || u.includes('RESIDENTIAL')) return 'PHANTOM_ACCESSORIAL';
  if (u.includes('DUPLICATE')) return 'DUPLICATE_TRACKING';
  if (u.includes('LTL')) return 'LTL_SLA_FAILURE';
  if (u.includes('SLA')) return 'SLA_FAILURE';
  return u || 'OTHER';
}

export default async function DisputesPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;

  if (!clientId) {
    return <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Account not linked to a client.</p>;
  }

  let disputes: PortalDispute[] = [];
  let audits: AuditResult[] = [];

  try {
    [disputes, audits] = await Promise.all([
      fetchRecords('Disputes', {
        filterByFormula: `FIND("${clientId}", ARRAYJOIN({Client}))`,
        sort: [{ field: 'Opened date', direction: 'desc' }],
        maxRecords: 500,
      }) as Promise<PortalDispute[]>,
      fetchRecords('Audit Results', {
        filterByFormula: `FIND("${clientId}", ARRAYJOIN({Client}))`,
        maxRecords: 1000,
      }) as Promise<AuditResult[]>,
    ]);
  } catch (err) {
    console.error('Portal disputes load failed:', err);
  }

  const auditMap = new Map(audits.map((a) => [a.id, a]));

  const totalFiled = disputes.length;
  const activeCount = disputes.filter((d) => d['Status'] !== 'Won' && d['Status'] !== 'Closed').length;
  const recovered = disputes
    .filter((d) => d['Status'] === 'Won')
    .reduce((s, d) => s + (d['Recovery amount'] || 0), 0);
  const resolvedCount = disputes.filter((d) => d['Status'] === 'Won' || d['Status'] === 'Closed').length;
  const avgDays = resolvedCount > 0
    ? Math.round(disputes
        .filter((d) => (d['Status'] === 'Won' || d['Status'] === 'Closed') && d['Opened date'] && d['Date resolved'])
        .reduce((s, d) => {
          const diff = new Date(d['Date resolved']!).getTime() - new Date(d['Opened date']!).getTime();
          return s + diff / 86400000;
        }, 0) / resolvedCount)
    : 0;

  const rows = disputes.map((d) => {
    const auditId = d['Audit result']?.[0];
    const audit = auditId ? auditMap.get(auditId) : undefined;
    const ruleRaw = audit?.['Detected by'] || '';
    const ruleCode = normalizeRule(String(ruleRaw));
    return {
      id: d['Dispute ID'] || d.id.slice(0, 10),
      ruleLabel: RULE_LABEL[ruleCode] || ruleCode,
      carrier: d['Carrier (display)'] || '—',
      filedDate: shortDate(d['Opened date']),
      amount: d['Disputed amount'] || 0,
      recoveryAmount: d['Recovery amount'] || 0,
      status: d['Status'] || 'Open',
      trackingNumber: d['Tracking number'] || '—',
      invoiceId: d['Invoice']?.[0]?.slice(0, 10) || '—',
      billedAmount: audit?.['Billed amount'] || 0,
      expectedAmount: audit?.['Expected amount'] || 0,
      resolvedDate: shortDate(d['Date resolved']),
      notes: d['Resolution notes'] || '',
    };
  });

  return (
    <DisputesList
      rows={rows}
      totalFiled={totalFiled}
      activeCount={activeCount}
      recovered={recovered}
      avgDays={avgDays}
    />
  );
}
