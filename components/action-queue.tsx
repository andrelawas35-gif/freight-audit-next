/*
  components/action-queue.tsx — interactive audit result list.

  'use client' because it needs onClick handlers and useState.
  Data is passed in as props from the server component (app/page.tsx).
*/

'use client';

import { useState } from 'react';
import { fmtUSD, fmtDate, daysUntil } from '@/lib/format';

export function ActionQueue({ auditResults, disputes }: {
  auditResults: any[];
  disputes: any[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Split audit results into those without disputes (need action)
  const needsAction = auditResults.filter(
    (a) => !(a['Disputes'] && a['Disputes'].length > 0)
  );

  // Open disputes needing follow-up
  const openDisputes = disputes.filter(
    (d) => !['Won', 'Closed'].includes(d['Status'] || '')
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Flagged audits needing review ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 11,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Flagged audits — needs review</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1 }}>
              {needsAction.length} items · {fmtUSD(needsAction.reduce((s, a) => s + (a['Variance'] || 0), 0))} recoverable
            </div>
          </div>
          {selected.size > 0 && (
            <button style={{
              padding: '3px 8px', fontSize: 11.5, fontWeight: 600, borderRadius: 5,
              background: 'var(--ink)', color: 'var(--canvas)', border: '1px solid var(--ink)',
              cursor: 'pointer',
            }}>
              File {selected.size} dispute{selected.size > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Table header */}
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>ID</th>
              <th>Notes</th>
              <th className="num">Billed</th>
              <th className="num">Expected</th>
              <th className="num">Variance</th>
              <th>Detected</th>
            </tr>
          </thead>
          <tbody>
            {needsAction.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 20 }}>
                  No flagged audits pending — queue is clear
                </td>
              </tr>
            ) : (
              needsAction.map((a) => (
                <tr key={a.id} className={selected.has(a.id) ? 'active' : ''}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {a.id.slice(0, 8)}
                  </td>
                  <td style={{ maxWidth: 300 }}>{a['Notes'] || '—'}</td>
                  <td className="num mono">{fmtUSD(a['Billed amount'] || 0, true)}</td>
                  <td className="num mono">{fmtUSD(a['Expected amount'] || 0, true)}</td>
                  <td className="num mono" style={{ color: 'var(--green-ink)', fontWeight: 600 }}>
                    {fmtUSD((a['Billed amount'] || 0) - (a['Expected amount'] || 0), true)}
                  </td>
                  <td>{fmtDate(a['Audited at'])}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Open disputes ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 11,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Open disputes</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1 }}>
              {openDisputes.length} active · {fmtUSD(openDisputes.reduce((s, d) => s + (d['Disputed amount'] || 0), 0))} pending
            </div>
          </div>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th>Dispute</th>
              <th>Status</th>
              <th className="num">Amount</th>
              <th>Opened</th>
              <th>Filed</th>
            </tr>
          </thead>
          <tbody>
            {openDisputes.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 20 }}>
                  No open disputes
                </td>
              </tr>
            ) : (
              openDisputes.map((d) => (
                <tr key={d.id}>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {d['Dispute ID'] || d.id.slice(0, 8)}
                  </td>
                  <td>
                    <StatusBadge status={d['Status']} />
                  </td>
                  <td className="num mono" style={{ fontWeight: 600 }}>
                    {fmtUSD(d['Disputed amount'] || 0, true)}
                  </td>
                  <td>{fmtDate(d['Opened date'])}</td>
                  <td>{fmtDate(d['Filed date'])}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    'Open':       { bg: 'var(--amber-soft)', color: 'var(--amber-ink)' },
    'In review':  { bg: 'var(--blue-soft)',  color: 'var(--blue-ink)' },
    'Submitted':  { bg: 'var(--violet-soft)', color: 'var(--violet-ink)' },
    'Escalated':  { bg: 'var(--hot-soft)',   color: 'var(--hot-ink)' },
    'Won':        { bg: 'var(--green-soft)', color: 'var(--green-ink)' },
    'Closed':     { bg: 'var(--surface-sunk)', color: 'var(--ink-3)' },
  };
  const c = colors[status || ''] || colors['Open'];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      background: c.bg, color: c.color,
    }}>
      {status || 'Open'}
    </span>
  );
}
