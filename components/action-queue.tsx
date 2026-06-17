/*
  components/action-queue.tsx — interactive audit result list.

  'use client' because it needs onClick handlers and useState.
  Data is passed in as props from the server component (app/page.tsx).
*/

'use client';

import { useState } from 'react';
import { fmtUSD, fmtDate, daysUntil } from '@/lib/format';

import { Card, SectionLabel, Btn, RuleTag, CarrierMark, StagePill, DeadlineChip, Checkbox } from '@/components/ui/primitives';
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
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 11,
          background: 'linear-gradient(180deg, var(--amber-soft), transparent 220%)',
        }}>
          <span style={{
            width: 24, height: 24, borderRadius: 6, background: 'var(--amber-soft)',
            border: '1px solid var(--amber-line)', display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'var(--amber-ink)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.005em' }}>Flagged audits · awaiting review</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1 }}>
              Today's batch. Sorted by dollar value.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <div className="mono tnum" style={{ fontSize: 13.5, fontWeight: 700 }}>{needsAction.length}</div>
              <div style={{ fontSize: 9.5, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>items</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono tnum" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--green-ink)' }}>{fmtUSD(needsAction.reduce((s, a) => s + Math.max(0, (a['Billed amount'] || 0) - (a['Expected amount'] || 0)), 0))}</div>
              <div style={{ fontSize: 9.5, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>exposure</div>
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
                     <Checkbox
                      checked={selected.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      ariaLabel={`select ${a.id}`}
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
      </Card>


      {/* ── Open disputes ── */}
      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 11,
          background: 'linear-gradient(180deg, var(--blue-soft), transparent 220%)',
        }}>
          <span style={{
            width: 24, height: 24, borderRadius: 6, background: 'var(--blue-soft)',
            border: '1px solid var(--blue-line)', display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'var(--blue-ink)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.005em' }}>Open disputes</div>
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
                    <StagePill stage={d['Status'] || 'Open'} />
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
      </Card>
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


