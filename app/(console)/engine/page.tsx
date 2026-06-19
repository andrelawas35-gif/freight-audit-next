/*
  app/(console)/engine/page.tsx — Audit Engine control + run history.

  Staff trigger audit runs here (all clients or one, optional dry run) and see
  a log of every past run with what it checked and found.
*/

import { fetchRecords } from '@/lib/airtable';
import { listRuns } from '@/lib/audit/runs';
import { fmtUSD } from '@/lib/format';
import { RunPanel } from '@/components/console/run-panel';
import type { Client } from '@/lib/types';

export const dynamic = 'force-dynamic';

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

  try {
    const [clientsRaw, runsRaw] = await Promise.all([
      fetchRecords('Clients', { maxRecords: 200, fields: ['Company name'] }),
      listRuns(30),
    ]);
    clients = (clientsRaw as Client[])
      .map((c) => ({ id: c.id, name: c['Company name'] || c.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    runs = runsRaw;
  } catch (err) {
    console.error('Engine page load failed:', err);
  }

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 800 }}>Audit engine</h1>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
          Run the rule engine over ingested invoices. New findings appear in the Queue.
        </p>
      </div>

      <RunPanel clients={clients} />

      {/* Run history */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 12.5, fontWeight: 700 }}>
          Run history
        </div>
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
      </div>
    </div>
  );
}
