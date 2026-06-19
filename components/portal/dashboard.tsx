'use client';

/*
  components/portal/dashboard.tsx — interactive client dashboard.

  Built for non-technical clients: big plain-language numbers, charts, friendly
  status tags, one-click CSV export, and a fully responsive layout that stacks
  cleanly on mobile. Receives plain serializable data from the server page.
*/

import { useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, Cell, CartesianGrid,
} from 'recharts';
import { StatusTag } from './status-tag';

// ── theme colors (match globals.css) ─────────────────────────
const C = {
  green: 'oklch(0.74 0.15 152)',
  greenInk: 'oklch(0.80 0.16 152)',
  amber: 'oklch(0.78 0.15 70)',
  amberInk: 'oklch(0.84 0.14 75)',
  blue: 'oklch(0.70 0.14 244)',
  blueInk: 'oklch(0.78 0.13 244)',
  ink3: 'oklch(0.62 0.006 80)',
  line: 'oklch(0.30 0.006 80)',
};

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
};

const usd = (n: number) =>
  '$' + Math.round(n).toLocaleString('en-US');

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── KPI card ──────────────────────────────────────────────────
function Kpi({
  label, value, sub, tone, onClick,
}: {
  label: string; value: string; sub?: string;
  tone: 'green' | 'amber' | 'blue' | 'neutral';
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const color =
    tone === 'green' ? C.greenInk :
    tone === 'amber' ? C.amberInk :
    tone === 'blue' ? C.blueInk : 'var(--ink)';
  const glow =
    tone === 'green' ? 'var(--green-soft)' :
    tone === 'amber' ? 'var(--amber-soft)' :
    tone === 'blue' ? 'var(--blue-soft)' : 'var(--line)';
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        background: 'var(--surface)',
        border: `1px solid ${hover ? glow : 'var(--line)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '15px 17px',
        transition: 'transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease',
        transform: hover && onClick ? 'translateY(-2px)' : 'none',
        boxShadow: hover && onClick ? '0 8px 20px -8px rgba(0,0,0,0.5)' : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: color, opacity: 0.85 }} />
      <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 27, fontWeight: 800, color, marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 3 }}>{sub}</div>}
    </button>
  );
}

function Card({ id, title, action, children }: {
  id?: string; title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section id={id} style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)', padding: 18, scrollMarginTop: 70,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'var(--surface-sunk)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius-sm)', padding: '5px 10px',
        fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer',
      }}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M7 11l5 4 5-4M5 21h14" />
      </svg>
      Export CSV
    </button>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--line-strong)',
      borderRadius: 6, padding: '7px 10px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--ink-3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{usd(payload[0].value)}</div>
    </div>
  );
}

export function Dashboard(props: DashboardProps) {
  const {
    companyName, recovered, inDispute, activeCount, totalCount,
    totalSpend, marginPct, monthly, breakdown, recentRecovered, openDisputes,
  } = props;

  const [chartMode, setChartMode] = useState<'cumulative' | 'monthly'>('cumulative');
  const hasMonthly = monthly.length > 0;
  const hasBreakdown = breakdown.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{companyName}</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>
          Freight overcharge recovery, working on your behalf.
        </p>
      </div>

      {/* KPI row — responsive auto-fit, stacks on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Recovered" value={usd(recovered)} sub="credited & pending" tone="green" onClick={() => scrollTo('recovery-trend')} />
        <Kpi label="In dispute" value={usd(inDispute)} sub={`${activeCount} active claim${activeCount === 1 ? '' : 's'}`} tone="amber" onClick={() => scrollTo('open-claims')} />
        <Kpi
          label="Margin recovered"
          value={totalSpend > 0 ? marginPct.toFixed(1) + '%' : '—'}
          sub={totalSpend > 0 ? `of ${usd(totalSpend)} spend` : 'awaiting invoices'}
          tone="blue"
          onClick={() => scrollTo('breakdown')}
        />
        <Kpi label="Total claims" value={String(totalCount)} sub="lifetime" tone="neutral" />
      </div>

      {/* Recovery trend */}
      <Card
        id="recovery-trend"
        title="Recovery over time"
        action={
          <div style={{ display: 'inline-flex', padding: 2, gap: 2, borderRadius: 7, background: 'var(--surface-sunk)', border: '1px solid var(--line)' }}>
            {(['cumulative', 'monthly'] as const).map((m) => (
              <button key={m} onClick={() => setChartMode(m)} style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer',
                textTransform: 'capitalize',
                background: chartMode === m ? 'var(--surface)' : 'transparent',
                color: chartMode === m ? 'var(--ink)' : 'var(--ink-3)',
              }}>{m}</button>
            ))}
          </div>
        }
      >
        {hasMonthly ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthly} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gRecover" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.green} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={C.green} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" stroke={C.ink3} tick={{ fontSize: 11, fill: C.ink3 }} tickLine={false} axisLine={false} />
              <YAxis stroke={C.ink3} tick={{ fontSize: 11, fill: C.ink3 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} width={44} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey={chartMode === 'cumulative' ? 'cumulative' : 'recovered'}
                stroke={C.green} strokeWidth={2.4} fill="url(#gRecover)" dot={{ r: 2.5, fill: C.green }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Empty text="No recoveries to chart yet." />
        )}
      </Card>

      {/* Where the bleeding is — carrier/error breakdown */}
      <Card id="breakdown" title="Where the bleeding is">
        {hasBreakdown ? (
          <ResponsiveContainer width="100%" height={Math.max(140, breakdown.length * 46)}>
            <BarChart data={breakdown} layout="vertical" margin={{ top: 0, right: 18, left: 8, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={150}
                tick={{ fontSize: 11.5, fill: 'var(--ink-2)' }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'var(--hover)' }} content={<ChartTooltip />} />
              <Bar dataKey="amount" radius={[0, 5, 5, 0]} barSize={20}>
                {breakdown.map((b, i) => (
                  <Cell key={i} fill={`oklch(0.68 0.13 ${b.hue})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty text="No flagged charges yet — your engine hasn’t found issues for this account." />
        )}
      </Card>

      {/* Two lists — responsive, stack on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 16 }}>
        <Card
          title="Recently recovered"
          action={
            recentRecovered.length > 0 ? (
              <ExportButton onClick={() => downloadCsv('recovered.csv', [
                ['Claim', 'Date', 'Recovered'],
                ...recentRecovered.map((d) => [d.id, d.date, d.amount]),
              ])} />
            ) : null
          }
        >
          {recentRecovered.length === 0 && <Empty text="No recoveries yet." />}
          {recentRecovered.map((d) => (
            <Row key={d.id} left={d.id} sub={d.date} right={usd(d.amount)} rightColor={C.greenInk} />
          ))}
        </Card>

        <Card
          id="open-claims"
          title="Working on your behalf"
          action={
            openDisputes.length > 0 ? (
              <ExportButton onClick={() => downloadCsv('open-claims.csv', [
                ['Claim', 'Status', 'Amount'],
                ...openDisputes.map((d) => [d.id, d.status, d.amount]),
              ])} />
            ) : null
          }
        >
          {openDisputes.length === 0 && <Empty text="No open claims." />}
          {openDisputes.map((d) => (
            <Row
              key={d.id}
              left={d.id}
              tag={<StatusTag status={d.status} />}
              right={usd(d.amount)}
              rightColor={C.amberInk}
            />
          ))}
        </Card>
      </div>
    </div>
  );
}

function Row({ left, sub, tag, right, rightColor }: {
  left: string; sub?: string; tag?: React.ReactNode; right: string; rightColor: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, padding: '9px 0', borderTop: '1px solid var(--line-2)',
    }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{left}</span>
        {sub && <span style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{sub}</span>}
        {tag}
      </div>
      <span className="mono" style={{ fontSize: 13.5, fontWeight: 700, color: rightColor, whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: 0 }}>{text}</p>;
}
