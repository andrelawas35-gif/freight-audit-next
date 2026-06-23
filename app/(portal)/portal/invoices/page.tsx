import { auth } from '@/auth';
import { fetchRecords } from '@/lib/airtable';
import { InvoicesList } from '@/components/portal/invoices-list';
import type { AuditResult, Invoice } from '@/lib/types';

export const metadata = { title: 'Invoices - Aurelian Collective' };
export const dynamic = 'force-dynamic';

const RULE_TAG: Record<string, string> = {
  DIM_WEIGHT_TRAP: 'DIM', PHANTOM_ACCESSORIAL: 'RES', DUPLICATE_TRACKING: 'DUP',
  SLA_FAILURE: 'SLA', LTL_SLA_FAILURE: 'SLA',
};

function normalizeRule(raw: string) {
  const value = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (value.includes('DIM')) return 'DIM_WEIGHT_TRAP';
  if (value.includes('PHANTOM') || value.includes('RESIDENTIAL') || value.includes('ACCESSORIAL')) return 'PHANTOM_ACCESSORIAL';
  if (value.includes('DUPLICATE')) return 'DUPLICATE_TRACKING';
  if (value.includes('SLA') || value.includes('LATE')) return 'SLA_FAILURE';
  return value;
}

export default async function InvoicesPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!clientId) return <p className="portal-muted">Account not linked to a client.</p>;

  let invoices: Invoice[] = [];
  let audits: AuditResult[] = [];
  try {
    [invoices, audits] = await Promise.all([
      fetchRecords('Invoices', {
        filterByFormula: `FIND("${clientId}", ARRAYJOIN({Clients}))`,
        sort: [{ field: 'Invoice date', direction: 'desc' }], maxRecords: 1000,
      }) as Promise<Invoice[]>,
      fetchRecords('Audit Results', {
        filterByFormula: `FIND("${clientId}", ARRAYJOIN({Client}))`, maxRecords: 2000,
      }) as Promise<AuditResult[]>,
    ]);
  } catch (error) {
    console.error('Portal invoices load failed:', error);
  }

  const auditsByInvoice = new Map<string, AuditResult[]>();
  for (const audit of audits) {
    for (const invoiceId of audit.Invoice || []) {
      const current = auditsByInvoice.get(invoiceId) || [];
      current.push(audit);
      auditsByInvoice.set(invoiceId, current);
    }
  }

  const rows = invoices.map((invoice) => {
    const findings = (auditsByInvoice.get(invoice.id) || []).filter((audit) => audit.Outcome === 'FLAGGED');
    const flagged = findings.reduce((sum, audit) => sum + Math.max(0, audit.Variance || 0), 0);
    const rawStatus = (invoice.Status || '').toUpperCase();
    const status = ['FLAGGED', 'REVIEWED', 'RESOLVED', 'CLEAN'].includes(rawStatus)
      ? rawStatus : findings.length > 0 ? 'FLAGGED' : 'CLEAN';
    return {
      id: invoice.id, invoiceNumber: invoice['Invoice number'] || invoice.id.slice(0, 10),
      carrier: invoice.Carrier || '-', date: invoice['Invoice date'] || '',
      total: invoice['Amount billed'] || 0, flagged, status,
      findings: findings.map((audit) => {
        const rule = normalizeRule(String(audit['Detected by'] || audit['Audit Rules']?.[0] || ''));
        return {
          id: audit.id, description: audit.Notes || 'Potential carrier overcharge', trackingNumber: '-',
          expected: audit['Expected amount'] || 0, billed: audit['Billed amount'] || 0,
          category: RULE_TAG[rule] || 'ACC',
        };
      }),
    };
  });

  return <InvoicesList rows={rows} />;
}
