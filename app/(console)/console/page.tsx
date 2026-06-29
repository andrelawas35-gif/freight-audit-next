/*
  app/page.tsx — "Today" dashboard.

  THIS IS THE KEY FILE. It shows the pattern you'll repeat for every page:

  1. This is a Server Component (no 'use client' at the top)
  2. It can use `await` directly to fetch from the database
  3. It passes data down to client components for interactivity
  4. The database credentials never reach the browser — they stay on the server

  To run this with your real data:
  1. Copy .env.local.example to .env.local
  2. Set DATABASE_URL to your Neon Postgres connection string
  3. Run `npm run dev`
*/

import { fetchRecords } from '@/lib/db/records';
import { fmtUSD } from '@/lib/format';
import { ActionQueue } from '@/components/action-queue';
import { Card, KPI, SectionLabel, Ticker, ConsoleErrorState } from '@/components/ui/primitives';
import { RecoveryTrendChart, AuditFindingsChart, DisputePipelineChart } from '@/components/console/dashboard-charts';


export const dynamic = 'force-dynamic';

// 1. Define your strict types
interface DashboardAuditResult {
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

interface DashboardDispute {
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

  let auditResults: DashboardAuditResult[] = [];
  let disputes: DashboardDispute[] = [];
  let stats = { wonMTD: 0, openDisputed: 0, winRate: 0, flaggedNew: 0 };
  let statusCounts = { open: 0, won: 0, dismissed: 0 };
  let recoveryData: { label: string; value: number }[] = [];
  let ruleBuckets: { name: string; count: number; amount: number; fill: string }[] = [];
  let pipelineData: { month: string; open: number; won: number; dismissed: number }[] = [];
  let loadError: string | null = null;

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

    auditResults = auditsRaw as DashboardAuditResult[];
    disputes = disputesRaw as DashboardDispute[];
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

       // Calculate recovery trend (last 6 months)
    const monthlyRecovery: Record<string, number> = {};
    disputes.forEach(d => {
      if (d['Opened date'] && d['Recovery amount']) {
        const month = d['Opened date'].substring(0, 7);
       monthlyRecovery[month] = (monthlyRecovery[month] || 0) + d['Recovery amount'];
      }
    });

    recoveryData = Object.entries(monthlyRecovery)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([date, amount]) => ({
        label: new Date(`${date}-01`).toLocaleDateString('en-US', { month: 'short' }),
       value: amount,
      }));

    // Calculate audit findings by rule
    const ruleCounts: Record<string, { name: string; count: number; amount: number; hue: number }> = {
      DIM_WEIGHT_TRAP:     { name: 'Dim-weight trap',     count: 0, amount: 0, hue: 280 },
      PHANTOM_ACCESSORIAL: { name: 'Phantom accessorial', count: 0, amount: 0, hue: 50  },
      DUPLICATE_TRACKING:  { name: 'Duplicate tracking',  count: 0, amount: 0, hue: 152 },
      SLA_FAILURE:         { name: 'SLA failure',         count: 0, amount: 0, hue: 220 },
      LTL_SLA_FAILURE:     { name: 'LTL SLA failure',     count: 0, amount: 0, hue: 244 },
    };
    auditResults.forEach(a => {
      const rules = (a['Audit Rules'] as string[]) || [];
      rules.forEach(code => {
       if (ruleCounts[code]) {
         ruleCounts[code].count++;
         ruleCounts[code].amount += a.Variance || a['Billed amount'] || 0;
       }
      });
    });
    ruleBuckets = Object.values(ruleCounts)
      .filter(b => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .map(b => ({
       name: b.name,
       count: b.count,
       amount: b.amount,
       fill: `hsl(${b.hue}, 45%, 48%)`,
      }));

    // Calculate dispute pipeline by month
    const pipelineMonthly: Record<string, { open: number; won: number; dismissed: number }> = {};
    disputes.forEach(d => {
      if (d['Opened date']) {
       const month = d['Opened date'].substring(0, 7);
       if (!pipelineMonthly[month]) pipelineMonthly[month] = { open: 0, won: 0, dismissed: 0 };
       const status = (d.Status || '').toLowerCase();
       if (status === 'won' || status === 'closed') pipelineMonthly[month].won++;
       else if (status === 'dismissed') pipelineMonthly[month].dismissed++;
       else pipelineMonthly[month].open++;
      }
    });
    pipelineData = Object.entries(pipelineMonthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([date, counts]) => ({
       month: new Date(`${date}-01`).toLocaleDateString('en-US', { month: 'short' }),
       ...counts,
      }));


  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error('Dashboard data load failed:', err);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      
    
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1340, margin: '0 auto', width: '100%' }}>
        
        {loadError ? (
          <ConsoleErrorState
            heading="Couldn't load dashboard data"
            message={loadError}
            hint="Check DATABASE_URL and database connectivity, then reload the page."
          />
        ) : auditResults.length === 0 && disputes.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* 3. Add the KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <KPI
                label="Recovered This Month"
                tone="green"
                accentBar="var(--green)"
                value={fmtUSD(stats.wonMTD)}
              />
              <KPI
                label="Active Exposure"
                tone="amber"
                accentBar="var(--amber)"
                value={fmtUSD(stats.openDisputed)}
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

            {/* Chart Grid — Recharts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Card>
                <SectionLabel>Recovery Trend (Last 6 Months)</SectionLabel>
                <RecoveryTrendChart data={recoveryData} />
              </Card>

              <Card>
                <SectionLabel>Audit Findings by Rule</SectionLabel>
                <AuditFindingsChart data={ruleBuckets} />
              </Card>
            </div>

            {/* Dispute Pipeline */}
            <Card>
              <SectionLabel>Dispute Pipeline by Month</SectionLabel>
              <DisputePipelineChart data={pipelineData} />
            </Card>

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
        Add your database connection string to <code style={{
          fontFamily: 'var(--mono)', fontSize: 11, padding: '1px 5px',
          background: 'var(--surface-sunk)', borderRadius: 4,
        }}>.env.local</code>
        <br />
        Then run your audit scripts to generate results.
      </div>
    </div>
  );
}

