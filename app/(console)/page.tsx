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
import { Card, KPI, Bars, SectionLabel, StatBar, Ticker } from '@/components/ui/primitives';


export const dynamic = 'force-dynamic';

// 1. Define your strict types
interface AirtableAuditResult {
  id: string;
  Outcome?: string;
  'Expected amount'?: number;
  'Billed amount'?: number;
  Variance?: number;
  Notes?: string;
  'Audited at'?: string;
  'Audit Rules'?: string[];
  Invoice?: string[];
  Disputes?: string[];
}

interface AirtableDispute {
  id: string;
  'Dispute ID'?: string;
  Status?: string;
  'Disputed amount'?: number;
  'Opened date'?: string;
  'Filed date'?: string;
  'Recovery amount'?: number;
  'Date resolved'?: string;
}

export default async function TodayPage() {
  // ── fetch data from Airtable ──────────────────────────────
  // These three queries run on the server when the page loads.
  // They all run in parallel (Promise.all), so total time = slowest query.

  let auditResults: AirtableAuditResult[] = [];
  let disputes: AirtableDispute[] = [];
  let stats = { wonMTD: 0, openDisputed: 0, winRate: 0, flaggedNew: 0 };
  let statusCounts = { open: 0, won: 0, dismissed: 0 };
  let chartValues: number[] = [];
  let chartLabels: string[] = [];

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
          'Filed date', 'Recovery Amount', 'Date Resolved',
        ],
      }),
    ]);

    auditResults = auditsRaw as AirtableAuditResult[];
    disputes = disputesRaw as AirtableDispute[];
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

      // Calculate pipeline for the right-side card
    disputes.forEach((d) => {
      const status = (d.Status || 'open').toLowerCase();
      if (status === 'open' || status === 'pending') statusCounts.open += 1;
      else if (status === 'won' || status === 'closed') statusCounts.won += 1;
      else if (status === 'dismissed') statusCounts.dismissed += 1;
    });

       // Calculate chart data (Recovery by month)
    const monthlyData: Record<string, number> = {};
    disputes.forEach(d => {
      if (d['Opened date'] && d['Recovery amount']) {
        const month = d['Opened date'].substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + d['Recovery amount'];
      }
    });

      const mappedChartData = Object.entries(monthlyData)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .slice(-6)
      .map(([date, amount]) => ({
        label: new Date(`${date}-01`).toLocaleDateString('en-US', { month: 'short' }),
        value: amount
      }));

    chartValues = mappedChartData.map(d => d.value);
    chartLabels = mappedChartData.map(d => d.label);


  } catch (err) {
    // If Airtable isn't connected yet, show empty state
    console.error('Airtable fetch failed:', err);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      
    
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1340, margin: '0 auto', width: '100%' }}>
        
        {auditResults.length === 0 && disputes.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* 3. Add the KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <KPI
                label="Recovered This Month"
                tone="green"
                accentBar="var(--green)"
                value={fmtUSD(0)}
              />
              <KPI
                label="Active Exposure"
                tone="amber"
                accentBar="var(--amber)"
                value={fmtUSD(0)}
                sub={`${statusCounts.open} active disputes`}
              />
              <KPI
                label="Action Required"
                tone="ink"
                accentBar="var(--blue)"
                value={<Ticker value={stats.flaggedNew} />}
                sub="New anomalies flagged"
              />
              <KPI
                label="Win Rate"
                tone="green"
                accentBar="var(--green)"
                value={`${Math.round(stats.winRate * 100)}%`}
                sub="across resolved disputes"
              />
            </div>

            {/* 4. Add the Chart & Pipeline Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Card>
                <SectionLabel>Recovery Trend (Last 6 Months)</SectionLabel>
                {chartValues.length > 0 ? (
                  <div style={{ marginTop: 24 }}>
                    <Bars data={chartValues} height={120} accent="var(--green)" />
                    <div style={{ 
                      display: 'flex', justifyContent: 'space-between', marginTop: 8, padding: '0 4px',
                      fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' 
                    }}>
                      {chartLabels.map((label, i) => <span key={i}>{label}</span>)}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '40px 0' }}>
                    Not enough data
                  </div>
                )}
              </Card>

            <Card>
                <SectionLabel>Open exposure by rule</SectionLabel>
                <RuleBreakdown auditResults={auditResults} />
              </Card>
            </div>

            {/* 5. Keep your original Action Queue at the bottom */}
            <div>
              <SectionLabel>Today's Action Queue</SectionLabel>
              <ActionQueue auditResults={auditResults} disputes={disputes} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── small helper components (server-rendered, no interactivity) ──



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

function RuleBreakdown({ auditResults }: { auditResults: any[] }) {
  const RULES: Record<string, { name: string; hue: number }> = {
    DIM_WEIGHT_TRAP:     { name: 'Dim-weight trap',     hue: 280 },
    PHANTOM_ACCESSORIAL: { name: 'Phantom accessorial', hue: 50  },
    DUPLICATE_TRACKING:  { name: 'Duplicate tracking',  hue: 152 },
    SLA_FAILURE:         { name: 'SLA failure',         hue: 220 },
    LTL_SLA_FAILURE:     { name: 'LTL SLA failure',     hue: 244 },
  };
  const buckets = Object.entries(RULES).map(([key, r]) => {
    const matching = auditResults.filter(a => {
      const notes = (a['Notes'] || '').toLowerCase();
      if (key === 'DIM_WEIGHT_TRAP') return notes.includes('dim') || notes.includes('divisor');
      if (key === 'PHANTOM_ACCESSORIAL') return notes.includes('residential') || notes.includes('surcharge');
      if (key === 'DUPLICATE_TRACKING') return notes.includes('duplicate');
      if (key === 'SLA_FAILURE') return notes.includes('guarantee') || notes.includes('sla');
      if (key === 'LTL_SLA_FAILURE') return notes.includes('business days');
      return false;
    });
    const amt = matching.reduce((s, a) => s + Math.max(0, (a['Billed amount'] || 0) - (a['Expected amount'] || 0)), 0);
    return { key, name: r.name, hue: r.hue, n: matching.length, amt };
  });
  const totalAmt = buckets.reduce((a, b) => a + b.amt, 0) || 1;

  return (
    <>
      <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', marginBottom: 12, background: 'var(--surface-sunk)' }}>
        {buckets.map(r => r.amt > 0 && (
          <div key={r.key} style={{ width: `${(r.amt / totalAmt) * 100}%`, background: `oklch(0.68 0.14 ${r.hue})` }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {buckets.map(r => (
          <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 7, height: 7, borderRadius: 9, background: `oklch(0.68 0.14 ${r.hue})`, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{r.name}</span>
            <span className="mono tnum" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.n}</span>
            <span className="mono tnum" style={{ fontSize: 12, fontWeight: 700, width: 60, textAlign: 'right' }}>{fmtUSD(r.amt)}</span>
          </div>
        ))}
      </div>
    </>
  );
}