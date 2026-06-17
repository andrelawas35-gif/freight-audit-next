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
import { Card, KPI, SectionLabel, StatBar, Ticker, Bars } from '@/components/ui/primitives';
import { Dispute, Client, AuditResult } from '@/lib/types';


export const dynamic = 'force-dynamic';

// Extend the base Dispute type to include Airtable Lookup fields used in your mapping
type FetchedDispute = Dispute & {
  'Client'?: string[];
  'Audit rule'?: string[];
  'Tracking number'?: string;
  'Carrier (display)'?: string;
  'Assigned to'?: string;
};

export default async function DisputesPage() {
  let rows: DisputeRow[] = [];
  let loadError: string | null = null;

    // Top level stats for the UI Primitives
  let totalDisputed = 0;
  let openExposure = 0;
  let totalRecovered = 0;
  let statusCounts = { open: 0, won: 0, closed: 0 };
  const monthlyData: Record<string, number> = {};

 try {
    const [disputesRaw, clientsRaw, auditResultsRaw] = await Promise.all([
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

    // Apply strict types
    const disputes = disputesRaw as FetchedDispute[];
    const clients = clientsRaw as Client[];
    const auditResults = auditResultsRaw as AuditResult[];

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

      
      // ── Populate Top-Level KPI Data ──
      const disputedAmt = d['Disputed amount'] || 0;
      const recoveredAmt = d['Recovery amount'] || 0;

      totalDisputed += disputedAmt;
      totalRecovered += recoveredAmt;

      if (stage === 'Won') {
        statusCounts.won += 1;
      } else if (stage === 'Closed') {
        statusCounts.closed += 1;
      } else {
        openExposure += (disputedAmt - recoveredAmt);
        statusCounts.open += 1;
      }

      // Chart Data grouping
      if (d['Opened date']) {
        const month = d['Opened date'].substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + disputedAmt;
      }

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

 // Format chart data for <Bars />
  const chartData = Object.entries(monthlyData)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .slice(-6);

  const chartValues = chartData.map(d => d[1]);
  const chartLabels = chartData.map(d => new Date(`${d[0]}-01`).toLocaleDateString('en-US', { month: 'short' }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      
      {/* Top StatBar Strip */}
      <StatBar items={[
        { label: 'Total Disputes', value: rows.length },
        { label: 'Active Pipeline', value: statusCounts.open, tone: 'var(--amber-ink)' },
        { label: 'Won', value: statusCounts.won, tone: 'var(--green-ink)' },
        { label: 'Closed/Lost', value: statusCounts.closed, tone: 'var(--ink-faint)' },
      ]} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1340, margin: '0 auto', width: '100%' }}>
        
        <div>
       
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
            Manage and track active recovery claims
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <KPI 
            label="Total Disputed" 
            tone="ink" 
            accentBar="var(--blue)"
            value={<Ticker value={totalDisputed} format={(v) => fmtUSDsafe(v)} />} 
            sub="All time volume"
          />
          <KPI 
            label="Open Exposure" 
            tone="amber" 
            accentBar="var(--amber)"
            value={<Ticker value={Math.max(0, openExposure)} format={(v) => fmtUSDsafe(v)} />} 
            sub="Awaiting resolution"
          />
          <KPI 
            label="Total Recovered" 
            tone="green" 
            accentBar="var(--green)"
            value={<Ticker value={totalRecovered} format={(v) => fmtUSDsafe(v)} />} 
            sub="Successfully won"
          />
        </div>

        {/* Chart Row */}
        <Card>
          <SectionLabel>New Dispute Volume (Last 6 Months)</SectionLabel>
          {chartValues.length > 0 ? (
            <div style={{ marginTop: 24 }}>
              <Bars data={chartValues} height={120} accent="var(--amber)" />
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

        {/* Your Existing Interactive Data Table */}
        <div>
          <SectionLabel>Active Cases</SectionLabel>
          <DisputesView initialRows={rows} loadError={loadError} />
        </div>

      </div>
    </div>
  );
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
