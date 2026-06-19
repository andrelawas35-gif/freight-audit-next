/*
  app/(console)/ingestion/page.tsx — Ingestion & match monitor.

  An invoice can only be audited if it's matched to a shipment (the "expected"
  warehouse data). This screen shows ingestion volume, match rate, and audit
  coverage — plus the unmatched invoices that need attention.
*/

import { fetchRecords } from '@/lib/airtable';
import { fmtUSD } from '@/lib/format';
import type { Invoice, Shipment } from '@/lib/types';

export const dynamic = 'force-dynamic';

function pct(n: number, d: number) {
  if (!d) return '0%';
  return Math.round((n / d) * 100) + '%';
}

function Stat({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: 'green' | 'amber' | 'red' }) {
  const color =
    tone === 'green' ? 'var(--green-ink)' :
    tone === 'amber' ? 'var(--amber-ink)' :
    tone === 'red' ? 'oklch(0.80 0.12 25)' : 'var(--ink)';
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '13px 15px' }}>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, color, marginTop: 5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Badge({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 'var(--radius-pill)',
      background: ok ? 'var(--green-soft)' : 'var(--surface-sunk)',
      color: ok ? 'var(--green-ink)' : 'var(--ink-faint)',
      border: `1px solid ${ok ? 'var(--green-line)' : 'var(--line)'}`,
    }}>
      {ok ? yes : no}
    </span>
  );
}

export default async function IngestionPage() {
  let invoices: Invoice[] = [];
  let shipments: Shipment[] = [];
  let auditedInvoiceIds = new Set<string>();

  try {
    const [inv, ship, audits] = await Promise.all([
      fetchRecords('Invoices', { maxRecords: 1000 }),
      fetchRecords('Shipments', { maxRecords: 1000 }),
      fetchRecords('Audit Results', { maxRecords: 1000, fields: ['Invoice'] }),
    ]);
    invoices = inv as Invoice[];
    shipments = ship as Shipment[];
    auditedInvoiceIds = new Set(
      (audits as { Invoice?: string[] }[]).flatMap((a) => a['Invoice'] ?? [])
    );
  } catch (err) {
    console.error('Ingestion page load failed:', err);
  }

  const hasShipment = (i: Invoice) => Array.isArray(i['Shipment']) && i['Shipment']!.length > 0;
  const matched = invoices.filter(hasShipment);
  const unmatched = invoices.filter((i) => !hasShipment(i));

  const referencedShipmentIds = new Set(invoices.flatMap((i) => i['Shipment'] ?? []));
  const unlinkedShipments = shipments.filter((s) => !referencedShipmentIds.has(s.id));

  const audited = invoices.filter((i) => auditedInvoiceIds.has(i.id));

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1200, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 800 }}>Ingestion &amp; matching</h1>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
          Invoices need a matched shipment to be auditable. Track coverage and fix the gaps.
        </p>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        <Stat label="Invoices ingested" value={String(invoices.length)} />
        <Stat label="Matched to shipment" value={pct(matched.length, invoices.length)} sub={`${matched.length} of ${invoices.length}`} tone="green" />
        <Stat label="Unmatched" value={String(unmatched.length)} sub="can't be audited" tone={unmatched.length ? 'amber' : undefined} />
        <Stat label="Audited" value={pct(audited.length, invoices.length)} sub={`${audited.length} of ${invoices.length}`} />
        <Stat label="Unlinked shipments" value={String(unlinkedShipments.length)} sub="no invoice yet" tone={unlinkedShipments.length ? 'amber' : undefined} />
      </div>

      {/* Unmatched invoices — the actionable list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 12.5, fontWeight: 700 }}>
          Unmatched invoices
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 400, marginLeft: 8 }}>
            · waiting on shipment data (often a client CSV upload)
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th className="num">Amount billed</th>
              <th>Invoice date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {unmatched.slice(0, 20).map((i) => (
              <tr key={i.id}>
                <td className="mono">{i['Invoice number'] || i.id.slice(0, 10)}</td>
                <td className="num mono">{fmtUSD(i['Amount billed'] || 0)}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{i['Invoice date'] || '—'}</td>
                <td>{i['Status'] || '—'}</td>
              </tr>
            ))}
            {unmatched.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>
                  {invoices.length === 0 ? 'No invoices ingested yet.' : 'All invoices are matched. 🎉'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent invoices with pipeline state */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 12.5, fontWeight: 700 }}>
          Recent invoices
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th className="num">Amount</th>
              <th>Matched</th>
              <th>Audited</th>
            </tr>
          </thead>
          <tbody>
            {invoices.slice(0, 15).map((i) => (
              <tr key={i.id}>
                <td className="mono">{i['Invoice number'] || i.id.slice(0, 10)}</td>
                <td className="num mono">{fmtUSD(i['Amount billed'] || 0)}</td>
                <td><Badge ok={hasShipment(i)} yes="Matched" no="Unmatched" /></td>
                <td><Badge ok={auditedInvoiceIds.has(i.id)} yes="Audited" no="Pending" /></td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 24 }}>
                  No invoices yet. Ingest via the API routes or upload shipment data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
