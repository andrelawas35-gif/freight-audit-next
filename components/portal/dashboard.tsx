'use client';

import { useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, CartesianGrid,
} from 'recharts';

export type DashboardProps = {
  companyName: string;
  recovered: number;
  inDispute: number;
  activeCount: number;
  totalCount: number;
  totalSpend: number;
  marginPct: number;
  monthly: { month: string; recovered: number; cumulative: number }[];
  breakdown: { label: string; amount: number; hue: number }[];
  recentRecovered: { id: string; date: string; amount: number }[];
  openDisputes: { id: string; status: string; amount: number }[];
  topCarriers: { carrier: string; amount: number; pct: number }[];
  activity: { id: string; text: string; date: string; tone: string }[];
};

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

const STATUS_PILL: Record<string, { label: string; bg: string; fg: string }> = {
  Open:        { label: 'OPN', bg: 'rgba(94,106,210,0.12)', fg: '#818cf8' },
  'In review': { label: 'REV', bg: 'rgba(94,106,210,0.12)', fg: '#818cf8' },
  Submitted:   { label: 'SUB', bg: 'rgba(167,139,250,0.1)', fg: '#a78bfa' },
  Escalated:   { label: 'ESC', bg: 'rgba(251,191,36,0.1)', fg: '#fbbf24' },
  Won:         { label: 'WON', bg: 'rgba(74,222,128,0.1)', fg: '#4ade80' },
  Closed:      { label: 'LST', bg: 'rgba(248,113,113,0.08)', fg: '#f87171' },
};

function Pill({ status }: { status: string }) {
  const s = STATUS_PILL[status] || STATUS_PILL.Open;
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 9999,
      background: s.bg, color: s.fg,
    }}>
      {s.label}
    </span>
  );
}

function StatCard({ label, value, color, sub }: {
  label: string; value: string; color: string; sub?: string;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12,
      padding: '16px 20px',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
    >
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'rgba(255,255,255,0.4)', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 800,
        color, letterSpacing: '-0.02em', lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, children, style: s }: {
  title?: string; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12,
      padding: '16px 20px',
      ...s,
    }}>
      {title && (
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.25)', marginBottom: 14,
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function HBar({ label, amount, maxAmount, color }: {
  label: string; amount: number; maxAmount: number; color: string;
}) {
  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: '#EDEDEF' }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color }}>{usd(amount)}</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: color, borderRadius: 2,
          transformOrigin: 'left', animation: 'portalBarGrow 0.7s ease-out both',
        }} />
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 6, padding: '7px 10px', fontSize: 12,
    }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, color: '#EDEDEF' }}>{usd(payload[0].value)}</div>
    </div>
  );
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((cell) => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function Dashboard(props: DashboardProps) {
  const {
    companyName, recovered, inDispute, activeCount, totalCount,
    monthly, breakdown, recentRecovered, openDisputes, topCarriers, activity,
  } = props;
  const [chartMode, setChartMode] = useState<'cumulative' | 'monthly'>('cumulative');
  const winRate = totalCount > 0
    ? Math.round((recentRecovered.length / Math.max(1, recentRecovered.length + openDisputes.length)) * 100)
    : 0;
  const hasMonthly = monthly.length > 0;
  const maxBreakdown = breakdown.length > 0 ? breakdown[0].amount : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: '#EDEDEF', margin: 0 }}>
          {companyName}
        </h1>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
          Freight overcharge recovery, working on your behalf.
        </p>
      </div>

      {/* Stats row */}
      <div className="portal-dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard label="Recovered" value={usd(recovered)} color="#4ade80" sub={`+${usd(monthly.length > 0 ? monthly[monthly.length - 1].recovered : 0)} this month`} />
        <StatCard label="In dispute" value={usd(inDispute)} color="#f87171" sub={`${activeCount} active`} />
        <StatCard label="Active" value={String(activeCount)} color="#EDEDEF" />
        <StatCard label="Win rate" value={winRate > 0 ? `${winRate}%` : '—'} color="#4ade80" />
      </div>

      {/* Surcharge breakdown + Recovery pipeline */}
      <div className="portal-dashboard-primary" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12 }}>
        <SectionCard title="Surcharge breakdown">
          {breakdown.length > 0 ? breakdown.map((b) => (
            <HBar key={b.label} label={b.label} amount={b.amount} maxAmount={maxBreakdown} color="#4ade80" />
          )) : (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>No flagged surcharges yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Recovery pipeline">
          {hasMonthly ? (
            <div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {(['cumulative', 'monthly'] as const).map((m) => (
                  <button key={m} onClick={() => setChartMode(m)} style={{
                    fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.04em', padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: chartMode === m ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: chartMode === m ? '#EDEDEF' : 'rgba(255,255,255,0.3)',
                    transition: 'all 0.1s',
                  }}>{m}</button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={monthly} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gPortalRecover" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4ade80" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4ade80" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke="none" tick={{ fontSize: 9, fontFamily: 'var(--mono)', fill: 'rgba(255,255,255,0.3)' }} tickLine={false} />
                  <YAxis stroke="none" tick={{ fontSize: 9, fontFamily: 'var(--mono)', fill: 'rgba(255,255,255,0.3)' }} tickLine={false}
                    tickFormatter={(v) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} width={40} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey={chartMode === 'cumulative' ? 'cumulative' : 'recovered'}
                    stroke="#4ade80" strokeWidth={2} fill="url(#gPortalRecover)" dot={{ r: 2, fill: '#4ade80' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>No data yet.</p>
          )}
        </SectionCard>
      </div>

      <div className="portal-dashboard-secondary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SectionCard title="Top carriers">
          {topCarriers.map((carrier) => <div className="portal-carrier-row" key={carrier.carrier}><div><strong>{carrier.carrier}</strong><span>{carrier.pct}%</span><b>{usd(carrier.amount)}</b></div><div><span style={{ width: `${carrier.pct}%` }} /></div></div>)}
          {topCarriers.length === 0 ? <p className="portal-muted">No carrier activity yet.</p> : null}
        </SectionCard>
        <SectionCard title="Recent activity">
          <div className="portal-activity-list">{activity.map((item, index) => <div className="portal-activity-item" key={item.id}><div><span className={item.tone} />{index < activity.length - 1 ? <i /> : null}</div><p><strong>{item.text}</strong><small>{item.date}</small></p></div>)}</div>
          {activity.length === 0 ? <p className="portal-muted">No recent activity.</p> : null}
        </SectionCard>
      </div>

      {/* Bottom tables */}
      <div className="portal-dashboard-bottom" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SectionCard title="Recently recovered">
          {recentRecovered.length === 0 && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>No recoveries yet.</p>
          )}
          {recentRecovered.slice(0, 5).map((d) => (
            <div key={d.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: '#EDEDEF' }}>{d.id}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{d.date}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: '#4ade80' }}>{usd(d.amount)}</span>
                <Pill status="Won" />
              </div>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Active disputes">
          {openDisputes.length === 0 && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>No open claims.</p>
          )}
          {openDisputes.slice(0, 5).map((d) => (
            <div key={d.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: '#EDEDEF' }}>{d.id}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: '#f87171' }}>{usd(d.amount)}</span>
                <Pill status={d.status} />
              </div>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  );
}
