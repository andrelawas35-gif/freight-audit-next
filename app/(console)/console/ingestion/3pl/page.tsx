/*
  app/(console)/ingestion/3pl/page.tsx — 3PL ingestion review.

  Shows staged 3PL fulfillment lines grouped by billing cycle with three-way
  match status, plus a recent-lines table. Audit rules + dispute batches build
  on this staged data in later phases.
*/

import Link from 'next/link';
import { listFulfillmentLines, getCycleSummaries } from '@/lib/ingestion/3pl/stage';
import { fetchRecords } from '@/lib/db/records';
import { fmtUSD } from '@/lib/format';
import { KPI, SectionLabel, TableFooter, ConsoleErrorState } from '@/components/ui/primitives';
import { RunThreePLAudit } from '@/components/console/run-3pl-audit';
import type { Client } from '@/lib/types';

export const dynamic = 'force-dynamic';
const THREE_PL_DISPLAY_LIMIT = 50;

export default async function ThreePLPage() {
  let lines: Awaited<ReturnType<typeof listFulfillmentLines>> = [];
  let cycles: Awaited<ReturnType<typeof getCycleSummaries>> = [];
  let clientNames: Record<string, string> = {};
  let hasMoreLines = false;
  let hasMoreCycles = false;
  let loadError: string | null = null;

  try {
    const [linesRaw, cyclesRaw, clientsRaw] = await Promise.all([
      listFulfillmentLines(THREE_PL_DISPLAY_LIMIT + 1),
      getCycleSummaries(THREE_PL_DISPLAY_LIMIT + 1),
      fetchRecords('Clients', { maxRecords: 500, fields: ['Company name'] }),
    ]);
    hasMoreLines = linesRaw.length > THREE_PL_DISPLAY_LIMIT;
    hasMoreCycles = cyclesRaw.length > THREE_PL_DISPLAY_LIMIT;
    lines = linesRaw.slice(0, THREE_PL_DISPLAY_LIMIT);
    cycles = cyclesRaw.slice(0, THREE_PL_DISPLAY_LIMIT);
    clientNames = Object.fromEntries((clientsRaw as Client[]).map((c) => [c.id, c['Company name'] || c.id]));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error('3PL page load failed:', err);
  }

  if (loadError) {
    return (
      <div style={{ padding: 14, maxWidth: 1200, margin: '0 auto' }}>
        <ConsoleErrorState
          heading="Couldn't load 3PL staging data"
          message={loadError}
          hint="Check DATABASE_URL and database connectivity, then reload the page."
        />
      </div>
    );
  }

  const totalLines = cycles.reduce((s, c) => s + c.lines, 0);
  const totalUnmatched = cycles.reduce((s, c) => s + c.unmatched, 0);
  const totalBilled = cycles.reduce((s, c) => s + c.billed, 0);
  const matchRate = totalLines > 0 ? Math.round(((totalLines - totalUnmatched) / totalLines) * 100) : 0;

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1200, margin: '0 auto' }}>
      <div>
        <Link href="/console/ingestion" style={{ fontSize: 11.5, color: 'var(--ink-3)', textDecoration: 'none' }}>← Ingestion</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KPI label="Staged lines" accentBar="var(--blue)" value={String(totalLines)} sub="fulfillment" />
        <KPI label="Match rate" tone="green" accentBar="var(--green)" value={matchRate + '%'} sub="to client orders" />
        <KPI label="Unmatched" tone={totalUnmatched > 0 ? 'amber' : 'ink'} value={String(totalUnmatched)} sub="no client order found" />
        <KPI label="Billed (staged)" value={fmtUSD(totalBilled)} sub="across cycles" />
      </div>

      {/* Run the 3PL audit over staged lines */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Audit staged 3PL lines</div>
        <RunThreePLAudit />
      </div>

      {/* By billing cycle — the dispute batch unit */}
      <div>
        <SectionLabel>By billing cycle</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr><th>Client</th><th>Cycle</th><th className="num">Lines</th><th className="num">Matched</th><th className="num">Unmatched</th><th className="num">Billed</th></tr>
            </thead>
            <tbody>
              {cycles.map((c, i) => (
                <tr key={i}>
                  <td>{clientNames[c.client_id || ''] || c.client_id || '—'}</td>
                  <td className="mono">{c.invoice_cycle || '—'}</td>
                  <td className="num mono">{c.lines}</td>
                  <td className="num mono" style={{ color: 'var(--green-ink)' }}>{c.matched}</td>
                  <td className="num mono" style={{ color: c.unmatched > 0 ? 'var(--amber-ink)' : 'var(--ink-faint)' }}>{c.unmatched}</td>
                  <td className="num mono">{fmtUSD(c.billed)}</td>
                </tr>
              ))}
              {cycles.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>
                  No 3PL data staged yet. POST a file to /api/ingest/3pl.
                </td></tr>
              )}
            </tbody>
          </table>
          <TableFooter showing={cycles.length} total={cycles.length} label="cycles" hasMore={hasMoreCycles} />
        </div>
      </div>

      {/* Recent staged lines */}
      <div>
        <SectionLabel>Recent staged lines</SectionLabel>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr><th>Order ID</th><th>Tracking</th><th className="num">Units</th><th className="num">Pick fee</th><th className="num">Billed</th><th>Match</th></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{l.order_id || '—'}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{l.tracking_number || '—'}</td>
                  <td className="num mono">{l.units_picked ?? '—'}</td>
                  <td className="num mono">{l.base_pick_fee != null ? fmtUSD(l.base_pick_fee) : '—'}</td>
                  <td className="num mono">{l.total_billed != null ? fmtUSD(l.total_billed) : '—'}</td>
                  <td>
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--radius-pill)',
                      background: l.match_status === 'matched' ? 'var(--green-soft)' : 'var(--amber-soft)',
                      color: l.match_status === 'matched' ? 'var(--green-ink)' : 'var(--amber-ink)',
                      border: `1px solid ${l.match_status === 'matched' ? 'var(--green-line)' : 'var(--amber-line)'}`,
                    }}>{l.match_status}</span>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>No staged lines yet.</td></tr>
              )}
            </tbody>
          </table>
          <TableFooter showing={lines.length} total={lines.length} label="lines" hasMore={hasMoreLines} />
        </div>
      </div>
    </div>
  );
}
