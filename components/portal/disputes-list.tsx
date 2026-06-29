'use client';

import { useState } from 'react';

type Row = {
  id: string; ruleLabel: string; carrier: string; filedDate: string;
  amount: number; recoveryAmount: number; status: string;
  trackingNumber: string; invoiceId: string;
  billedAmount: number; expectedAmount: number;
  resolvedDate: string; notes: string;
};

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// Canonical dispute status pills (ADR 0005). Legacy Airtable-era statuses
// are kept as fallback mappings with the same rendering as their canonical equivalent.
const STATUS_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  // ── Canonical ──────────────────────────────────────────────────
  pending_review:    { label: 'REV', bg: 'rgba(94,106,210,0.12)',  fg: '#818cf8' },
  filed:             { label: 'FLD', bg: 'rgba(167,139,250,0.1)',  fg: '#a78bfa' },
  carrier_responded: { label: 'RSP', bg: 'rgba(251,191,36,0.1)',   fg: '#fbbf24' },
  won:               { label: 'WON', bg: 'rgba(74,222,128,0.1)',   fg: '#4ade80' },
  dismissed:         { label: 'DIS', bg: 'rgba(248,113,113,0.08)', fg: '#f87171' },
  partial:           { label: 'PRT', bg: 'rgba(251,191,36,0.1)',   fg: '#fbbf24' },
  appealed:          { label: 'APP', bg: 'rgba(251,191,36,0.1)',   fg: '#fbbf24' },
  closed:            { label: 'CLD', bg: 'rgba(248,113,113,0.08)', fg: '#f87171' },
  // ── Legacy fallbacks ───────────────────────────────────────────
  Open:              { label: 'REV', bg: 'rgba(94,106,210,0.12)',  fg: '#818cf8' },
  'In review':       { label: 'REV', bg: 'rgba(94,106,210,0.12)',  fg: '#818cf8' },
  Submitted:         { label: 'FLD', bg: 'rgba(167,139,250,0.1)',  fg: '#a78bfa' },
  Escalated:         { label: 'RSP', bg: 'rgba(251,191,36,0.1)',   fg: '#fbbf24' },
  Won:               { label: 'WON', bg: 'rgba(74,222,128,0.1)',   fg: '#4ade80' },
  Closed:            { label: 'CLD', bg: 'rgba(248,113,113,0.08)', fg: '#f87171' },
};

// Active = not in a terminal state (won, dismissed, closed)
const TERMINAL_STATUSES = new Set(['won', 'dismissed', 'closed']);

const FILTERS = [
  { key: 'all', label: 'ALL' },
  { key: 'active', label: 'ACTIVE' },
  { key: 'won', label: 'WON' },
  { key: 'lost', label: 'LOST' },
] as const;

type Filter = typeof FILTERS[number]['key'];

function Pill({ status }: { status: string }) {
  const s = STATUS_PILL[status] || STATUS_PILL.pending_review;
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 9999,
      background: s.bg, color: s.fg,
    }}>{s.label}</span>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: '14px 18px',
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'rgba(255,255,255,0.4)', marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 800,
        color, letterSpacing: '-0.02em',
      }}>{value}</div>
    </div>
  );
}

// Canonical lifecycle order (ADR 0005 state machine)
const TIMELINE_STAGES: readonly string[] = [
  'pending_review',
  'filed',
  'carrier_responded',
  'won',
];

export function DisputesList({ rows, totalFiled, activeCount, recovered, avgDays, loadError }: {
  rows: Row[]; totalFiled: number; activeCount: number; recovered: number; avgDays: number; loadError?: string | null;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const mayHaveMoreRows = rows.length >= 500;

  const filtered = rows.filter((r) => {
    if (filter === 'active') return !TERMINAL_STATUSES.has(r.status);
    if (filter === 'won') return r.status === 'won';
    if (filter === 'lost') return r.status === 'dismissed' || r.status === 'closed';
    return true;
  });

  const detail = selected ? rows.find((r) => r.id === selected) : null;
  const stageIdx = detail ? TIMELINE_STAGES.indexOf(detail.status) : -1;

  if (loadError) {
    return (
      <div style={{ padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171', marginBottom: 8 }}>Couldn't load disputes</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{loadError}</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: '#EDEDEF', margin: 0 }}>Disputes</h1>
        <div style={{ padding: '48px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>&#9878;</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#EDEDEF', marginBottom: 6 }}>No disputes yet</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
            Disputes appear here once our team files claims on your behalf.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header + filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: '#EDEDEF', margin: 0 }}>
          Disputes
        </h1>
        <div style={{ display: 'flex', gap: 4 }}>
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => { setFilter(f.key); setSelected(null); }} style={{
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.04em', padding: '5px 12px', borderRadius: 6,
              border: 'none', cursor: 'pointer',
              background: filter === f.key ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: filter === f.key ? '#EDEDEF' : 'rgba(255,255,255,0.35)',
              transition: 'all 0.1s',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="portal-dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard label="Total filed" value={String(totalFiled)} color="#EDEDEF" />
        <StatCard label="Active" value={String(activeCount)} color="#f87171" />
        <StatCard label="Total recovered" value={usd(recovered)} color="#4ade80" />
        <StatCard label="Avg resolution" value={avgDays > 0 ? `${avgDays}d` : '—'} color="#EDEDEF" />
      </div>

      {/* Table */}
      <div className="portal-table-scroll" style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {/* Header row */}
        <div className="portal-dispute-grid" style={{
          display: 'grid',
          gridTemplateColumns: '100px 1.2fr 80px 1fr 90px 80px',
          padding: '0 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {['ID', 'Rule', 'Carrier', 'Filed', 'Amount', 'Status'].map((h) => (
            <div key={h} style={{
              fontFamily: 'var(--mono)', fontSize: 9.5, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'rgba(255,255,255,0.4)', padding: '9px 0',
              textAlign: h === 'Amount' ? 'right' : 'left',
            }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {filtered.map((r) => (
          <div key={r.id} className="portal-dispute-grid"
            onClick={() => setSelected(selected === r.id ? null : r.id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1.2fr 80px 1fr 90px 80px',
              padding: '0 20px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              cursor: 'pointer',
              background: selected === r.id ? 'rgba(255,255,255,0.06)' : 'transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => { if (selected !== r.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            onMouseLeave={(e) => { if (selected !== r.id) e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ padding: '10px 0', fontFamily: 'var(--mono)', fontSize: 12, color: '#EDEDEF' }}>{r.id}</div>
            <div style={{ padding: '10px 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{r.ruleLabel}</div>
            <div style={{ padding: '10px 0', fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{r.carrier}</div>
            <div style={{ padding: '10px 0', fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>{r.filedDate}</div>
            <div style={{ padding: '10px 0', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: '#f87171', textAlign: 'right' }}>{usd(r.amount)}</div>
            <div style={{ padding: '10px 0', display: 'flex', alignItems: 'center' }}><Pill status={r.status} /></div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
            No disputes match this filter.
          </div>
        )}

        {/* Showing X of Y footer */}
        {filtered.length > 0 && (
          <div style={{
            padding: '9px 20px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 10.5, color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.03em',
            }}>
              {mayHaveMoreRows && filter !== 'all'
                ? `Showing ${filtered.length} of first ${rows.length.toLocaleString()} disputes; more may be available`
                : mayHaveMoreRows
                ? `Showing first ${rows.length.toLocaleString()} disputes; more may be available`
                : filter !== 'all'
                ? `Showing ${filtered.length} of ${rows.length} disputes`
                : `${rows.length} disputes`}
            </span>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {detail && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, padding: 24,
          animation: 'portalSlideIn 0.3s ease-out both',
          position: 'relative',
        }}>
          <button onClick={() => setSelected(null)} style={{
            position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4,
          }}>
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div className="portal-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Left — details */}
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#EDEDEF', marginBottom: 16 }}>
                {detail.id} — {detail.ruleLabel}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Amount', value: usd(detail.amount), color: '#f87171' },
                  { label: 'Recovery', value: detail.recoveryAmount > 0 ? usd(detail.recoveryAmount) : '—', color: '#4ade80' },
                  { label: 'Filed', value: detail.filedDate, color: '#EDEDEF' },
                  { label: 'Tracking', value: detail.trackingNumber, color: '#EDEDEF' },
                  { label: 'Invoice', value: detail.invoiceId, color: '#EDEDEF' },
                  { label: 'Carrier', value: detail.carrier, color: '#EDEDEF' },
                  { label: 'Expected', value: detail.expectedAmount > 0 ? usd(detail.expectedAmount) : '—', color: 'rgba(255,255,255,0.5)' },
                  { label: 'Billed', value: detail.billedAmount > 0 ? usd(detail.billedAmount) : '—', color: 'rgba(255,255,255,0.5)' },
                ].map((item) => (
                  <div key={item.label}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — timeline */}
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>Timeline</div>
              {TIMELINE_STAGES.map((stage, i) => {
                const reached = i <= stageIdx;
                const current = i === stageIdx;
                return (
                  <div key={stage} style={{ display: 'flex', gap: 12, marginBottom: i < TIMELINE_STAGES.length - 1 ? 0 : 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        background: current ? '#4ade80' : reached ? '#EDEDEF' : 'rgba(255,255,255,0.15)',
                        border: current ? '2px solid rgba(74,222,128,0.3)' : 'none',
                      }} />
                      {i < TIMELINE_STAGES.length - 1 && (
                        <div style={{ width: 1, flex: 1, minHeight: 20, background: reached ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)' }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: current ? 700 : 500, color: reached ? '#EDEDEF' : 'rgba(255,255,255,0.25)' }}>{stage}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
