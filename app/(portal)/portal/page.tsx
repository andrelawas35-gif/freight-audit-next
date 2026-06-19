/*
  app/(portal)/portal/page.tsx — client dashboard.

  Scoped to the signed-in user's client (session.user.clientId). Shows the
  money story: recovered, in dispute, recent recoveries, and open disputes —
  all filtered to this client's linked records.
*/

import { auth } from '@/auth';
import { fetchRecord, fetchRecords } from '@/lib/airtable';
import { fmtUSD, fmtDate } from '@/lib/format';
import type { Dispute, Client } from '@/lib/types';

export const dynamic = 'force-dynamic';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' }) {
  const color = tone === 'green' ? 'var(--green-ink)' : tone === 'amber' ? 'var(--amber-ink)' : 'var(--ink)';
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export default async function PortalDashboard() {
  const session = await auth();
  const clientId = session?.user?.clientId;

  if (!clientId) {
    return (
      <div style={{ color: 'var(--ink-2)', fontSize: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Welcome</h1>
        <p>
          Your account isn’t linked to a client company yet. Please contact your Aurelian Collective
          account manager to finish setup.
        </p>
      </div>
    );
  }

  let client: Client | null = null;
  let disputes: Dispute[] = [];

  try {
    client = (await fetchRecord('Clients', clientId)) as Client;
    disputes = (await fetchRecords('Disputes', {
      filterByFormula: `FIND("${clientId}", ARRAYJOIN({Client}))`,
      sort: [{ field: 'Opened date', direction: 'desc' }],
      maxRecords: 500,
    })) as Dispute[];
  } catch (err) {
    console.error('Portal dashboard load failed:', err);
  }

  const isResolved = (s?: string) => s === 'Won' || s === 'Closed';
  const won = disputes.filter((d) => d['Status'] === 'Won');
  const open = disputes.filter((d) => !isResolved(d['Status']));

  const recovered = won.reduce((a, d) => a + (d['Recovery amount'] || 0), 0);
  const inDispute = open.reduce((a, d) => a + (d['Disputed amount'] || 0), 0);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>
        {client?.['Company name'] || 'Your dashboard'}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>
        Freight overcharge recovery, working on your behalf.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <Stat label="Recovered" value={fmtUSD(recovered)} tone="green" />
        <Stat label="In dispute" value={fmtUSD(inDispute)} tone="amber" />
        <Stat label="Active disputes" value={String(open.length)} />
        <Stat label="Total disputes" value={String(disputes.length)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recently recovered */}
        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Recently recovered</h2>
          {won.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>No recoveries yet.</p>
          )}
          {won.slice(0, 6).map((d) => (
            <Row
              key={d.id}
              left={d['Dispute ID'] || d.id.slice(0, 10)}
              sub={fmtDate(d['Date resolved'])}
              right={fmtUSD(d['Recovery amount'] || 0)}
              rightColor="var(--green-ink)"
            />
          ))}
        </section>

        {/* Working on your behalf */}
        <section
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Working on your behalf</h2>
          {open.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-faint)' }}>No open disputes.</p>
          )}
          {open.slice(0, 6).map((d) => (
            <Row
              key={d.id}
              left={d['Dispute ID'] || d.id.slice(0, 10)}
              sub={d['Status'] || 'Open'}
              right={fmtUSD(d['Disputed amount'] || 0)}
              rightColor="var(--amber-ink)"
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function Row({
  left,
  sub,
  right,
  rightColor,
}: {
  left: string;
  sub: string;
  right: string;
  rightColor: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderTop: '1px solid var(--line-2)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{left}</div>
        <div style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{sub}</div>
      </div>
      <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: rightColor }}>{right}</span>
    </div>
  );
}
