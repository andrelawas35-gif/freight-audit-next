'use client';

/*
  dashboard-charts.tsx — Recharts-based charting for the console dashboard.
  Replaces the static Bars and RuleBreakdown with area/bar Recharts components.

  Data is computed server-side and passed as props — no DB queries in the browser.
*/

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────
interface MonthlyDataPoint {
  label: string;
  value: number;
}

interface RuleBucket {
  name: string;
  count: number;
  amount: number;
  fill: string;
}

// ── Recovery Trend (area chart) ─────────────────────────────────
export function RecoveryTrendChart({ data }: { data: MonthlyDataPoint[] }) {
  if (!data.length) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '40px 0' }}>
        Not enough data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="recoveryGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--green)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--green)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
          axisLine={{ stroke: 'var(--surface-2)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          width={50}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)', border: '1px solid var(--surface-2)',
            borderRadius: 6, fontSize: 12, color: 'var(--ink)',
          }}
          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Recovered']}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--green)"
          strokeWidth={2}
          fill="url(#recoveryGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Audit Findings by Rule (bar chart) ──────────────────────────
const RULE_COLORS: Record<string, string> = {
  DIM_WEIGHT_TRAP:     '#9b59b6',
  PHANTOM_ACCESSORIAL: '#f1c40f',
  DUPLICATE_TRACKING:  '#2ecc71',
  SLA_FAILURE:         '#3498db',
  LTL_SLA_FAILURE:     '#e67e22',
};

export function AuditFindingsChart({ data }: { data: RuleBucket[] }) {
  if (!data.length) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '40px 0' }}>
        No findings yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        layout="vertical"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10, fill: 'var(--ink-3)' }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)', border: '1px solid var(--surface-2)',
            borderRadius: 6, fontSize: 12, color: 'var(--ink)',
          }}
          formatter={(value: number, _name: string, props: any) => [
            `${value} findings · $${props.payload.amount.toLocaleString()}`,
            props.payload.name,
          ]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <rect key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Dispute Pipeline (stacked bar by month) ─────────────────────
interface PipelinePoint {
  month: string;
  open: number;
  won: number;
  dismissed: number;
}

export function DisputePipelineChart({ data }: { data: PipelinePoint[] }) {
  if (!data.length) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '40px 0' }}>
        No disputes yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
          axisLine={{ stroke: 'var(--surface-2)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--ink-faint)' }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--surface)', border: '1px solid var(--surface-2)',
            borderRadius: 6, fontSize: 12, color: 'var(--ink)',
          }}
        />
        <Bar dataKey="open" stackId="a" fill="var(--amber)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="won" stackId="a" fill="var(--green)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="dismissed" stackId="a" fill="var(--ink-faint)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
