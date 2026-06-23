import { auth } from '@/auth';
import { fetchRecords } from '@/lib/airtable';
import { ReportsList } from '@/components/portal/reports-list';
import type { Dispute, Invoice } from '@/lib/types';

export const metadata = { title: 'Reports - Aurelian Collective' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;
  if (!clientId) return <p className="portal-muted">Account not linked to a client.</p>;

  let disputes: Dispute[] = [];
  let invoices: Invoice[] = [];
  try {
    [disputes, invoices] = await Promise.all([
      fetchRecords('Disputes', { filterByFormula: `FIND("${clientId}", ARRAYJOIN({Client}))`, maxRecords: 1000 }) as Promise<Dispute[]>,
      fetchRecords('Invoices', { filterByFormula: `FIND("${clientId}", ARRAYJOIN({Clients}))`, maxRecords: 2000 }) as Promise<Invoice[]>,
    ]);
  } catch (error) {
    console.error('Portal reports load failed:', error);
  }

  const months = new Map<string, { recovered: number; disputes: number; won: number; resolved: number; invoices: number }>();
  const getMonth = (key: string) => {
    const current = months.get(key) || { recovered: 0, disputes: 0, won: 0, resolved: 0, invoices: 0 };
    months.set(key, current);
    return current;
  };
  for (const dispute of disputes) {
    const date = dispute['Opened date'] || dispute['Filed date'];
    if (!date) continue;
    const month = getMonth(date.slice(0, 7));
    month.disputes += 1;
    if (dispute.Status === 'Won') { month.won += 1; month.resolved += 1; month.recovered += dispute['Recovery amount'] || 0; }
    if (dispute.Status === 'Closed') month.resolved += 1;
  }
  for (const invoice of invoices) {
    if (invoice['Invoice date']) getMonth(invoice['Invoice date'].slice(0, 7)).invoices += 1;
  }

  const reports = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, value]) => ({
    key,
    month: new Date(`${key}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    recovered: value.recovered, disputes: value.disputes,
    winRate: value.resolved > 0 ? Math.round((value.won / value.resolved) * 100) : 0,
    invoices: value.invoices,
  }));

  return <ReportsList reports={reports} />;
}
