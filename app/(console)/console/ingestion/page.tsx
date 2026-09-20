/*
  app/(console)/ingestion/page.tsx - Ingestion control panel.

  Staff can stage supported CSV intake, enqueue existing pipeline jobs, and
  monitor the records that are still blocking audit or dispute readiness.
*/

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { RunPanel } from '@/components/console/run-panel';
import { IngestionIntakePanel } from '@/components/console/ingestion-intake-panel';
import { ManualIngestionPanel } from '@/components/console/manual-ingestion-panel';
import { KPI, SectionLabel } from '@/components/ui/primitives';
import { fmtUSD } from '@/lib/format';
import { getIngestionControlPanelData } from '@/lib/ingestion/control-panel';

export const dynamic = 'force-dynamic';

function pct(n: number, d: number) {
  if (!d) return '0%';
  return Math.round((n / d) * 100) + '%';
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function IngestionPage() {
  let data: Awaited<ReturnType<typeof getIngestionControlPanelData>> | null = null;
  let loadError: string | null = null;

  try {
    data = await getIngestionControlPanelData();
  } catch (err) {
    console.error('Ingestion control panel load failed:', err);
    loadError = err instanceof Error ? err.message : String(err);
  }

  if (!data) {
    return (
      <div style={{ padding: 14, maxWidth: 1180, margin: '0 auto' }}>
        <SectionLabel>Ingestion control panel</SectionLabel>
        <div style={panelStyle}>
          <div style={{ color: 'oklch(0.84 0.10 25)', fontSize: 13 }}>
            Could not load ingestion state.
          </div>
          {loadError ? <pre style={errorPreStyle}>{loadError}</pre> : null}
        </div>
      </div>
    );
  }

  const matchRate = pct(data.metrics.matched, data.metrics.invoices);
  const auditCoverage = pct(data.metrics.audited, data.metrics.invoices);
  const disputeCoverage = pct(data.metrics.findingsInDispute, data.metrics.findings);
  const needsAttention =
    data.metrics.exceptions +
    data.work.unmatchedInvoices.length +
    data.metrics.tplUnmatched +
    data.metrics.queuedJobs;

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <KPI label="Invoices staged" value={String(data.metrics.invoices)} accentBar="var(--blue)" sub={`${matchRate} matched`} />
        <KPI label="Audit coverage" value={auditCoverage} accentBar="var(--green)" tone="green" sub={`${data.metrics.audited} audited`} />
        <KPI label="Findings to cases" value={disputeCoverage} accentBar="var(--amber)" sub={`${data.metrics.findingsInDispute} of ${data.metrics.findings}`} />
        <KPI
          label="Needs attention"
          value={String(needsAttention)}
          accentBar={needsAttention ? 'var(--amber)' : 'var(--line-strong)'}
          tone={needsAttention ? 'amber' : 'ink'}
          sub={`${data.metrics.exceptions} exceptions`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, .95fr)', gap: 14, alignItems: 'start' }}>
        <section>
          <SectionLabel right={<LinkChip href="/console/engine">Run history</LinkChip>}>Run pipeline jobs</SectionLabel>
          <RunPanel clients={data.clients} />
        </section>

        <section>
          <SectionLabel right={<LinkChip href="/console/ingestion/3pl">3PL staging</LinkChip>}>Stage a file</SectionLabel>
          <IngestionIntakePanel clients={data.clients} />
        </section>
      </div>

      <QuickLinks />

      <section>
        <SectionLabel>Type or paste intake</SectionLabel>
        <ManualIngestionPanel clients={data.clients} />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, .8fr)', gap: 14, alignItems: 'start' }}>
        <section>
          <SectionLabel right={<span className="mono tnum" style={mutedCountStyle}>{data.intake.events.length}</span>}>Recent intake events</SectionLabel>
          <TableShell>
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Source</th>
                  <th>Client</th>
                  <th>Carrier/3PL</th>
                  <th>File</th>
                  <th className="num">Rows</th>
                  <th className="num">Staged</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.intake.events.map((event) => (
                  <tr key={`${event.source}-${event.id}`}>
                    <td className="mono" style={smallMonoStyle}>{fmtTime(event.at)}</td>
                    <td>{event.source}</td>
                    <td>{event.client}</td>
                    <td className="mono" style={smallMonoStyle}>{event.carrier}</td>
                    <td className="mono" style={fileCellStyle}>{event.file}</td>
                    <td className="num mono">{event.rows}</td>
                    <td className="num mono">{event.staged}</td>
                    <td><StatusChip status={event.status} /></td>
                  </tr>
                ))}
                {data.intake.events.length === 0 ? <EmptyRow colSpan={8}>No intake events recorded yet.</EmptyRow> : null}
              </tbody>
            </table>
          </TableShell>
        </section>

        <section>
          <SectionLabel right={<span className="mono tnum" style={mutedCountStyle}>{data.audit.jobs.length}</span>}>Job queue</SectionLabel>
          <TableShell>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Queued</th>
                  <th>Type</th>
                  <th>Scope</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="mono" style={smallMonoStyle}>{fmtTime(job.queued_at)}</td>
                    <td>{job.job_type}</td>
                    <td className="mono" style={smallMonoStyle}>{job.client_id || job.cycle || 'all'}</td>
                    <td><StatusChip status={job.status} /></td>
                  </tr>
                ))}
                {data.audit.jobs.length === 0 ? <EmptyRow colSpan={4}>No audit jobs yet.</EmptyRow> : null}
              </tbody>
            </table>
          </TableShell>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, alignItems: 'start' }}>
        <AttentionPanel
          title="Unmatched invoices"
          count={data.work.unmatchedInvoices.length}
          href="/console/queue"
          rows={data.work.unmatchedInvoices.map((invoice) => ({
            id: invoice.id,
            primary: invoice['Invoice number'] || invoice.id.slice(0, 10),
            secondary: invoice['Invoice date'] || 'No invoice date',
            amount: invoice['Amount billed'] ? fmtUSD(invoice['Amount billed']) : '-',
          }))}
          empty="All visible invoices are linked to shipments."
        />

        <AttentionPanel
          title="WMS not linked"
          count={data.work.unlinkedShipments.length}
          href="/console/ingestion"
          rows={data.work.unlinkedShipments.map((shipment) => ({
            id: shipment.id,
            primary: shipment['Tracking number'] || shipment['PRO number'] || shipment.id.slice(0, 10),
            secondary: shipment['Ship date'] || shipment['Carrier'] || 'No ship date',
            amount: shipment['Actual weight lbs'] ? `${shipment['Actual weight lbs']} lb` : '-',
          }))}
          empty="No unlinked shipments in the visible window."
        />

        <AttentionPanel
          title="Code exceptions"
          count={data.work.exceptions.length}
          href="/console/ingestion/exceptions"
          rows={data.work.exceptions.map((exception) => ({
            id: exception.id,
            primary: exception.raw_code,
            secondary: `${exception.mapping_type} ${exception.carrier_scac || 'global'}`,
            amount: `${exception.occurrences}x`,
          }))}
          empty="No open mapping exceptions."
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <section>
          <SectionLabel right={<LinkChip href="/console/ingestion/3pl">Open 3PL</LinkChip>}>3PL cycles</SectionLabel>
          <TableShell>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Cycle</th>
                  <th className="num">Lines</th>
                  <th className="num">Matched</th>
                  <th className="num">Unmatched</th>
                  <th className="num">Billed</th>
                </tr>
              </thead>
              <tbody>
                {data.tpl.cycles.map((cycle, index) => (
                  <tr key={`${cycle.client_id}-${cycle.invoice_cycle}-${index}`}>
                    <td className="mono" style={smallMonoStyle}>{cycle.client_id || '-'}</td>
                    <td className="mono" style={smallMonoStyle}>{cycle.invoice_cycle || '-'}</td>
                    <td className="num mono">{cycle.lines}</td>
                    <td className="num mono" style={{ color: 'var(--green-ink)' }}>{cycle.matched}</td>
                    <td className="num mono" style={{ color: cycle.unmatched ? 'var(--amber-ink)' : 'var(--ink-faint)' }}>{cycle.unmatched}</td>
                    <td className="num mono">{fmtUSD(cycle.billed)}</td>
                  </tr>
                ))}
                {data.tpl.cycles.length === 0 ? <EmptyRow colSpan={6}>No 3PL fulfillment cycles staged.</EmptyRow> : null}
              </tbody>
            </table>
          </TableShell>
        </section>

        <section>
          <SectionLabel>Recent staged invoices</SectionLabel>
          <TableShell>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Carrier</th>
                  <th className="num">Amount</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.recentInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="mono" style={smallMonoStyle}>{invoice.invoiceNumber}</td>
                    <td>{invoice.client}</td>
                    <td className="mono" style={smallMonoStyle}>{invoice.carrier}</td>
                    <td className="num mono">{fmtUSD(invoice.amount)}</td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
                        <StatusChip status={invoice.matched ? 'matched' : 'unmatched'} />
                        <StatusChip status={invoice.audited ? 'audited' : 'pending'} />
                      </span>
                    </td>
                  </tr>
                ))}
                {data.audit.recentInvoices.length === 0 ? <EmptyRow colSpan={5}>No invoices staged yet.</EmptyRow> : null}
              </tbody>
            </table>
          </TableShell>
        </section>
      </div>
    </div>
  );
}

function QuickLinks() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
      <QuickLink href="/console/ingestion/exceptions" label="Map exceptions" detail="Review unknown accessorial and service codes" />
      <QuickLink href="/console/ingestion/3pl" label="Review 3PL" detail="Cycle summaries, line matches, storage intake" />
      <QuickLink href="/console/queue" label="Review findings" detail="Approve, dismiss, or file disputes" />
      <QuickLink href="/console/rulebook" label="Audit contract rules" detail="Contract, carrier, and global precedence" />
    </div>
  );
}

function QuickLink({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <Link href={href} style={{
      textDecoration: 'none',
      color: 'inherit',
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      padding: '12px 14px',
      display: 'grid',
      gap: 4,
      minHeight: 72,
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 750, color: 'var(--ink)' }}>{label}</span>
      <span style={{ fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.35 }}>{detail}</span>
    </Link>
  );
}

function AttentionPanel({
  title,
  count,
  href,
  rows,
  empty,
}: {
  title: string;
  count: number;
  href: string;
  rows: { id: string; primary: string; secondary: string; amount: string }[];
  empty: string;
}) {
  return (
    <section>
      <SectionLabel right={<LinkChip href={href}>{count}</LinkChip>}>{title}</SectionLabel>
      <TableShell>
        <table className="tbl">
          <thead>
            <tr>
              <th>Item</th>
              <th>Context</th>
              <th className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => (
              <tr key={row.id}>
                <td className="mono" style={smallMonoStyle}>{row.primary}</td>
                <td>{row.secondary}</td>
                <td className="num mono">{row.amount}</td>
              </tr>
            ))}
            {rows.length === 0 ? <EmptyRow colSpan={3}>{empty}</EmptyRow> : null}
          </tbody>
        </table>
      </TableShell>
    </section>
  );
}

function TableShell({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>
        {children}
      </td>
    </tr>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 20,
      padding: '2px 7px',
      borderRadius: 'var(--radius-pill)',
      border: `1px solid ${tone.border}`,
      background: tone.bg,
      color: tone.fg,
      fontSize: 10.5,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      textTransform: 'capitalize',
    }}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

function LinkChip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{
      color: 'var(--blue-ink)',
      textDecoration: 'none',
      fontSize: 11.5,
      fontWeight: 700,
    }}>
      {children}
    </Link>
  );
}

function statusTone(status: string) {
  if (['ok', 'completed', 'matched', 'audited', 'success'].includes(status)) {
    return { bg: 'var(--green-soft)', border: 'var(--green-line)', fg: 'var(--green-ink)' };
  }
  if (['partial', 'queued', 'running', 'pending', 'unmatched', 'no_rows'].includes(status)) {
    return { bg: 'var(--amber-soft)', border: 'var(--amber-line)', fg: 'var(--amber-ink)' };
  }
  if (['failed', 'error'].includes(status)) {
    return { bg: 'oklch(0.30 0.08 25)', border: 'oklch(0.44 0.12 25)', fg: 'oklch(0.86 0.10 25)' };
  }
  return { bg: 'var(--surface-sunk)', border: 'var(--line)', fg: 'var(--ink-2)' };
}

const panelStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  padding: 16,
};

const mutedCountStyle: CSSProperties = {
  color: 'var(--ink-faint)',
  fontSize: 11,
};

const smallMonoStyle: CSSProperties = {
  fontSize: 11.5,
};

const fileCellStyle: CSSProperties = {
  ...smallMonoStyle,
  maxWidth: 190,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const errorPreStyle: CSSProperties = {
  marginTop: 12,
  whiteSpace: 'pre-wrap',
  color: 'var(--ink-faint)',
  fontSize: 11.5,
};
