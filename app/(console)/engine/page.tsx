/*
  app/(console)/engine/page.tsx — Audit Engine control + run history.

  Staff trigger audit runs here (all clients or one, optional dry run) and see
  a log of every past run with what it checked and found.
*/

import { fetchRecords } from '@/lib/airtable';
import { listRuns } from '@/lib/audit/runs';
import { getRuleOutcomeStats } from '@/lib/disputes/outcomes';
import { fmtUSD, fmtPct } from '@/lib/format';
import { RunPanel } from '@/components/console/run-panel';
import { SectionLabel } from '@/components/ui/primitives';
import type { Client } from '@/lib/types';

export const dynamic = 'force-dynamic';

const RULE_LABEL: Record<string, string> = {
  DIM_WEIGHT_TRAP: 'Dim-weight overcharge',
  PHANTOM_ACCESSORIAL: 'Residential surcharge',
  DUPLICATE_TRACKING: 'Duplicate billing',
  SLA_FAILURE: 'Late delivery',
  LTL_SLA_FAILURE: 'LTL late delivery',
};

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default async function EnginePage() {
  let clients: { id: string; name: string }[] = [];
  let runs: Awaited<ReturnType<typeof listRuns>> = [];
  let ruleStats: Awaited<ReturnType<typeof getRuleOutcomeStats>> = [];

  try {
    const [clientsRaw, runsRaw, statsRaw] = await Promise.all([
      fetchRecords('Clients', { maxRecords: 200, fields: ['Company name'] }),
      listRuns(30),
      getRuleOutcomeStats(),
    ]);
    clients = (clientsRaw as Client[])
      .map((c) => ({ id: c.id, name: c['Company name'] || c.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    runs = runsRaw;
    ruleStats = statsRaw;
  } catch (err) {
    console.error('Engine page load failed:', err);
  }

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100, margin: '0 auto' }}>

      <div>
        <SectionLabel>Trigger a run</SectionLabel>
        <RunPanel clients={clients} />
      </div>

      <div>
        <SectionLabel right={
          <span className="mono tnum" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{runs.length}</span>
        }>Run history</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Scope</th>
                <th>Type</th>
                <th className="num">Invoices</th>
                <th className="num">Findings</th>
                <th className="num">Variance</th>
                <th>Status</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{fmtTime(r.started_at)}</td>
                  <td>{r.client_name || 'All clients'}</td>
                  <td>
                    <span style={{ fontSize: 11, color: r.dry_run ? 'var(--ink-3)' : 'var(--ink-2)' }}>
                      {r.dry_run ? 'Dry run' : 'Live'}
                    </span>
                  </td>
                  <td className="num mono">{r.invoices_checked}</td>
                  <td className="num mono" style={{ fontWeight: 700 }}>{r.findings_created}</td>
                  <td className="num mono" style={{ color: 'var(--amber-ink)' }}>
                    {r.total_variance > 0 ? fmtUSD(r.total_variance) : '—'}
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: r.status === 'success' ? 'var(--green-ink)'
                           : r.status === 'error' ? 'oklch(0.80 0.12 25)'
                           : 'var(--ink-3)',
                    }}>
                      {r.status}
                      {r.errors && r.errors.length > 0 ? ` · ${r.errors.length} err` : ''}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{r.triggered_by || '—'}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 30 }}>
                    No runs yet. Trigger one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {runs.length > 0 && (
            <div style={{ padding: '7px 14px', borderTop: '1px solid var(--line)' }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.03em' }}>
                {runs.length} runs
              </span>
            </div>
          )}
        </div>
      </div>

      <div>
        <SectionLabel right={
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>from carrier outcomes</span>
        }>Rule performance</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Rule</th>
                <th className="num">Won</th>
                <th className="num">Denied</th>
                <th className="num">Escalated</th>
                <th className="num">Win rate</th>
                <th className="num">Recovered</th>
                <th className="num">Denied $</th>
              </tr>
            </thead>
            <tbody>
              {ruleStats.map((s) => {
                const wr = s.won + s.denied > 0 ? s.win_rate : null;
                const wrColor = wr == null ? 'var(--ink-faint)' : wr >= 0.7 ? 'var(--green-ink)' : wr >= 0.4 ? 'var(--amber-ink)' : 'oklch(0.80 0.12 25)';
                return (
                  <tr key={s.rule_code}>
                    <td>{RULE_LABEL[s.rule_code] || s.rule_code}</td>
                    <td className="num mono" style={{ color: 'var(--green-ink)' }}>{s.won}</td>
                    <td className="num mono" style={{ color: 'oklch(0.80 0.12 25)' }}>{s.denied}</td>
                    <td className="num mono">{s.escalated}</td>
                    <td className="num mono" style={{ fontWeight: 700, color: wrColor }}>{wr == null ? '—' : fmtPct(wr)}</td>
                    <td className="num mono" style={{ color: 'var(--green-ink)' }}>{s.recovered > 0 ? fmtUSD(s.recovered) : '—'}</td>
                    <td className="num mono" style={{ color: 'var(--ink-3)' }}>{s.denied_amount > 0 ? fmtUSD(s.denied_amount) : '—'}</td>
                  </tr>
                );
              })}
              {ruleStats.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 30 }}>
                    No outcomes recorded yet. Apply carrier replies on the Disputes screen to build this.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {ruleStats.length > 0 && (
            <div style={{ padding: '7px 14px', borderTop: '1px solid var(--line)' }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.03em' }}>
                {ruleStats.length} rules tracked
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
