/*
  app/page.tsx — "Today" dashboard.

  THIS IS THE KEY FILE. It shows the pattern you'll repeat for every page:

  1. This is a Server Component (no 'use client' at the top)
  2. It can use `await` directly to fetch from Airtable
  3. It passes data down to client components for interactivity
  4. The Airtable PAT never reaches the browser — it stays on the server

  To run this with your real data:
  1. Copy .env.local.example to .env.local
  2. Paste your Airtable PAT and base ID
  3. Run `npm run dev`
*/

import { fetchRecords } from '@/lib/airtable';
import { fmtUSD, fmtDate, daysUntil } from '@/lib/format';
import { ActionQueue } from '@/components/action-queue';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  // ── fetch data from Airtable ──────────────────────────────
  // These three queries run on the server when the page loads.
  // They all run in parallel (Promise.all), so total time = slowest query.

  let auditResults: any[] = [];
  let disputes: any[] = [];
  let stats = { wonMTD: 0, openDisputed: 0, winRate: 0, flaggedNew: 0 };

  try {
    const [auditsRaw, disputesRaw] = await Promise.all([
      fetchRecords('Audit Results', {
        filterByFormula: `{Outcome} = 'FLAGGED'`,
        sort: [{ field: 'Audited at', direction: 'desc' }],
        maxRecords: 50,
        fields: [
           'Outcome', 'Expected amount', 'Billed amount',
          'Variance', 'Notes', 'Audited at', 'Audit Rules', 'Invoice', 'Disputes',
        ],
      }),
      fetchRecords('Disputes', {
        sort: [{ field: 'Opened date', direction: 'desc' }],
        maxRecords: 100,
        fields: [
          'Dispute ID', 'Status', 'Disputed amount', 'Opened date',
          'Filed date', 'Recovery amount', 'Date resolved',
        ],
      }),
    ]);

    auditResults = auditsRaw;
    disputes = disputesRaw;

    // ── compute stats from real data ──────────────────────────
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    const wonThisMonth = disputes.filter(
      (d: any) => d['Status'] === 'Won' && d['Date resolved'] && d['Date resolved'] >= monthStart
    );
    const openDisputes = disputes.filter(
      (d: any) => !['Won', 'Closed'].includes(d['Status'] || '')
    );
    const totalWon = disputes.filter((d: any) => d['Status'] === 'Won').length;
    const totalResolved = disputes.filter(
      (d: any) => ['Won', 'Closed'].includes(d['Status'] || '')
    ).length;

    stats = {
      wonMTD: wonThisMonth.reduce((s: number, d: any) => s + (d['Recovery amount'] || 0), 0),
      openDisputed: openDisputes.reduce((s: number, d: any) => s + (d['Disputed amount'] || 0), 0),
      winRate: totalResolved > 0 ? totalWon / totalResolved : 0,
      flaggedNew: auditResults.filter((a: any) => !(a['Disputes'] && a['Disputes'].length > 0)).length,
    };
  } catch (err) {
    // If Airtable isn't connected yet, show empty state
    console.error('Airtable fetch failed:', err);
  }

  return (
    <div>
      {/* Stat bar */}
      <div style={{
        height: 'var(--statbar-h)', flexShrink: 0, borderBottom: '1px solid var(--line)',
        background: 'var(--canvas)', display: 'flex', alignItems: 'stretch',
      }}>
        <StatItem label="Recovered MTD" value={fmtUSD(stats.wonMTD)} tone="var(--green-ink)" />
        <StatItem label="Open exposure" value={fmtUSD(stats.openDisputed)} tone="var(--amber-ink)" />
        <StatItem label="Win rate" value={Math.round(stats.winRate * 100) + '%'} tone="var(--green-ink)" />
        <StatItem label="Queue" value={`${stats.flaggedNew} new`} tone="var(--ink)" last />
      </div>

      {/* Main content */}
      <div style={{ padding: 16 }}>
        {auditResults.length === 0 && disputes.length === 0 ? (
          <EmptyState />
        ) : (
          <ActionQueue auditResults={auditResults} disputes={disputes} />
        )}
      </div>
    </div>
  );
}

// ── small helper components (server-rendered, no interactivity) ──

function StatItem({ label, value, tone, sub, last }: {
  label: string; value: string; tone: string; sub?: string; last?: boolean;
}) {
  return (
    <div style={{
      padding: '0 14px',
      borderRight: last ? 'none' : '1px solid var(--line)',
      display: 'flex', alignItems: 'center', gap: 9, minWidth: 0,
    }}>
      <span style={{
        fontSize: 9.5, fontWeight: 600, color: 'var(--ink-faint)',
        textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
      }}>{label}</span>
      <span className="mono tnum" style={{
        fontSize: 12.5, fontWeight: 700, color: tone, whiteSpace: 'nowrap',
      }}>{value}</span>
      {sub && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{sub}</span>}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 20px', color: 'var(--ink-3)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        No data yet
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
        Connect your Airtable by adding your PAT to <code style={{
          fontFamily: 'var(--mono)', fontSize: 11, padding: '1px 5px',
          background: 'var(--surface-sunk)', borderRadius: 4,
        }}>.env.local</code>
        <br />
        Then run your audit scripts to generate results.
      </div>
    </div>
  );
}
