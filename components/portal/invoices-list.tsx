'use client';

import { useState } from 'react';

type Finding = { id: string; description: string; trackingNumber: string; expected: number; billed: number; category: string };
type InvoiceRow = { id: string; invoiceNumber: string; carrier: string; date: string; total: number; flagged: number; status: string; findings: Finding[] };

const usd = (value: number) => '$' + Math.round(value).toLocaleString('en-US');
const shortDate = (value: string) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const STATUS: Record<string, { fg: string; bg: string }> = {
  FLAGGED: { fg: '#f87171', bg: 'rgba(248,113,113,0.08)' }, REVIEWED: { fg: '#fbbf24', bg: 'rgba(251,191,36,0.1)' },
  RESOLVED: { fg: '#4ade80', bg: 'rgba(74,222,128,0.1)' }, CLEAN: { fg: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.04)' },
};

function exportCsv(rows: InvoiceRow[]) {
  const values = [['Invoice', 'Carrier', 'Date', 'Total', 'Flagged', 'Status'], ...rows.map((r) => [r.invoiceNumber, r.carrier, r.date, r.total, r.flagged, r.status])];
  const csv = values.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'aurelian-invoices.csv'; anchor.click();
  URL.revokeObjectURL(url);
}

export function InvoicesList({ rows }: { rows: InvoiceRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((row) => row.id === selectedId);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const flagged = rows.reduce((sum, row) => sum + row.flagged, 0);
  const errorRate = total > 0 ? (flagged / total) * 100 : 0;
  const mayHaveMoreRows = rows.length >= 1000;

  return <div className="portal-page-stack">
    <div className="portal-page-header"><h1>Invoices</h1><button className="portal-ghost-button" onClick={() => exportCsv(rows)}>Export CSV</button></div>
    <div className="portal-stats portal-stats-3"><Stat label="Total invoiced" value={usd(total)} /><Stat label="Flagged amount" value={usd(flagged)} color="#f87171" /><Stat label="Error rate" value={`${errorRate.toFixed(1)}%`} /></div>
    <div className="portal-table-card portal-table-scroll">
      <div className="invoice-grid portal-grid-head">{['Invoice', 'Carrier', 'Date', 'Total', 'Flagged', 'Status'].map((label) => <span key={label}>{label}</span>)}</div>
      {rows.map((row) => { const clickable = row.findings.length > 0; const tone = STATUS[row.status] || STATUS.CLEAN; return <button key={row.id} className={`invoice-grid portal-grid-row${selectedId === row.id ? ' selected' : ''}`} disabled={!clickable} onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}>
        <span className="portal-mono strong">{row.invoiceNumber}</span><span>{row.carrier}</span><span>{shortDate(row.date)}</span><span className="portal-mono">{usd(row.total)}</span><span className="portal-mono" style={{ color: row.flagged ? '#f87171' : 'rgba(255,255,255,.3)' }}>{row.flagged ? usd(row.flagged) : '-'}</span><span><b className="portal-status" style={{ color: tone.fg, background: tone.bg }}>{row.status}</b></span>
      </button>; })}
      {rows.length === 0 ? <div className="portal-empty-row">No invoices available yet.</div> : null}
      {rows.length > 0 && (
        <div className="portal-table-footer">
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.03em' }}>
            {mayHaveMoreRows
              ? `Showing first ${rows.length.toLocaleString()} invoices; more may be available`
              : `${rows.length.toLocaleString()} invoices`}
          </span>
        </div>
      )}
    </div>
    {selected ? <InvoiceDetail invoice={selected} onClose={() => setSelectedId(null)} /> : null}
  </div>;
}

function Stat({ label, value, color = '#EDEDEF' }: { label: string; value: string; color?: string }) {
  return <div className="portal-stat-card"><span>{label}</span><strong style={{ color }}>{value}</strong></div>;
}

function InvoiceDetail({ invoice, onClose }: { invoice: InvoiceRow; onClose: () => void }) {
  return <section className="portal-detail-panel"><button className="portal-close-button" onClick={onClose} aria-label="Close invoice details">x</button><h2>{invoice.invoiceNumber} flagged items</h2><div className="portal-finding-list">
    {invoice.findings.map((finding) => <div className="portal-finding-row" key={finding.id}><span className="portal-category">{finding.category}</span><div><strong>{finding.description}</strong><small>{finding.trackingNumber}</small></div><div><small>Expected</small><strong>{usd(finding.expected)}</strong></div><div><small>Billed</small><strong style={{ color: '#f87171' }}>{usd(finding.billed)}</strong></div></div>)}
  </div></section>;
}
