'use client';

import { useMemo } from 'react';
import type { ComplianceData } from '@/lib/portal/data-loader';
import type { GatewayReadinessRow, InsuranceExposureRow } from '@/lib/intelligence/reports';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ── Helpers ──────────────────────────────────────────────────────

type Trend = 'up' | 'down' | 'flat' | 'none';

interface KpiCard {
  label: string;
  value: string;
  subtitle: string;
  color: string;
  trend: Trend;
}

function trendArrow(t: Trend): string {
  if (t === 'up') return '↑';
  if (t === 'down') return '↓';
  if (t === 'flat') return '→';
  return '—';
}

function trendColor(t: Trend): string {
  if (t === 'up') return '#4ade80';
  if (t === 'down') return '#f87171';
  return 'rgba(255,255,255,0.25)';
}

/** Group rows by month, return sorted month keys oldest→newest. */
function monthKeys<T extends { month: string }>(rows: T[]): string[] {
  return [...new Set(rows.map((r) => r.month))].sort();
}

/** Sum a numeric field for rows matching a given month. */
function sumForMonth<T extends { month: string }>(rows: T[], month: string, fn: (r: T) => number): number {
  let total = 0;
  for (const r of rows) {
    if (r.month === month) total += fn(r);
  }
  return total;
}

function computeTrend(
  rows: { month: string }[],
  fn: (r: { month: string }) => number,
  /** Higher is better (true) or lower is better (false). */
  higherIsBetter: boolean,
): Trend {
  const keys = monthKeys(rows);
  if (keys.length < 2) return 'none';
  const prev = sumForMonth(rows as any, keys[keys.length - 2], fn);
  const curr = sumForMonth(rows as any, keys[keys.length - 1], fn);
  if (prev === curr) return 'flat';
  if (higherIsBetter) return curr > prev ? 'up' : 'down';
  return curr < prev ? 'up' : 'down';
}

/** Case-insensitive match of a needle in haystack string or null. */
function catMatch(cat: string | null, needle: string): boolean {
  return cat != null && cat.toUpperCase().includes(needle.toUpperCase());
}

// ── KPI computators ───────────────────────────────────────────────

function uninsuredExposureKpi(
  ie: InsuranceExposureRow[],
): { value: string; subtitle: string; trend: Trend } {
  if (ie.length === 0) return { value: '—', subtitle: 'No data', trend: 'none' };
  const total = ie.reduce((s, r) => s + (r.preventable_exposure ?? 0), 0);
  const shipments = ie.reduce((s, r) => s + (r.shipment_count ?? 0), 0);
  const trend = computeTrend(ie, (r: any) => r.preventable_exposure ?? 0, false);
  return { value: usd(total), subtitle: `${shipments} shipments`, trend };
}

function sopComplianceKpi(
  gr: GatewayReadinessRow[],
): { value: string; subtitle: string; trend: Trend } {
  const sop = gr.filter((r) => catMatch(r.gateway_category, 'PACKAGING') || catMatch(r.gateway_category, 'SOP') || catMatch(r.gateway_category, 'SIGNATURE'));
  return categoryPctKpi(sop, gr.length, 'SOP');
}

function carrierAuthKpi(
  gr: GatewayReadinessRow[],
): { value: string; subtitle: string; trend: Trend } {
  const carrier = gr.filter((r) => catMatch(r.gateway_category, 'CARRIER'));
  return categoryPctKpi(carrier, gr.length, 'Carrier');
}

function signatureComplianceKpi(
  ie: InsuranceExposureRow[],
): { value: string; subtitle: string; trend: Trend } {
  const sig = ie.filter((r) => catMatch(r.insurance_risk_category, 'SIGNATURE'));
  return categoryPctKpi(sig, ie.length, 'Signature');
}

/** Shared category-percentage KPI: pct of total findings that involve this category.
 *  Higher compliance = fewer findings in this category = higher pct shown. */
function categoryPctKpi(
  subset: { month: string }[],
  totalLength: number,
  _label: string,
): { value: string; subtitle: string; trend: Trend } {
  if (totalLength === 0 || subset.length === 0) return { value: '—', subtitle: 'No data', trend: 'none' };
  // Compliance = 100 - (% of findings in this category)
  const pct = 100 - (subset.length / totalLength) * 100;
  const trend = computeTrend(subset as any, () => 1, false);
  return { value: `${Math.round(pct)}%`, subtitle: '30d trend →', trend };
}

function gatewayReadyKpi(
  gr: GatewayReadinessRow[],
): { value: string; subtitle: string; trend: Trend } {
  if (gr.length === 0) return { value: '—', subtitle: 'No data', trend: 'none' };
  const caught = gr.filter((r) => (r.gateway_roi ?? 0) > 0).length;
  const pct = Math.round((caught / gr.length) * 100);
  const flaggedShipments = gr
    .filter((r) => (r.gateway_roi ?? 0) > 0)
    .reduce((s, r) => s + (r.findings ?? 0), 0);
  const trend = computeTrend(gr, (r: any) => (r.gateway_roi ?? 0) > 0 ? 1 : 0, true);
  return { value: `${pct}%`, subtitle: `Would flag ${flaggedShipments} shipments`, trend };
}

function buildKpis(data: ComplianceData): KpiCard[] {
  const { insuranceExposure, gatewayReadiness } = data;

  const unins = uninsuredExposureKpi(insuranceExposure);
  const sop = sopComplianceKpi(gatewayReadiness);
  const carrier = carrierAuthKpi(gatewayReadiness);
  const sig = signatureComplianceKpi(insuranceExposure);
  const ready = gatewayReadyKpi(gatewayReadiness);

  return [
    { label: 'Uninsured Exposure', value: unins.value, subtitle: unins.subtitle, color: '#f87171', trend: unins.trend },
    { label: 'SOP Compliance', value: sop.value, subtitle: sop.subtitle, color: sop.value === '—' ? 'rgba(255,255,255,0.25)' : sop.value.endsWith('%') ? (parseFloat(sop.value) >= 90 ? '#4ade80' : '#fbbf24') : '#fbbf24', trend: sop.trend },
    { label: 'Carrier Authorization', value: carrier.value, subtitle: carrier.subtitle, color: carrier.value === '—' ? 'rgba(255,255,255,0.25)' : carrier.value.endsWith('%') ? (parseFloat(carrier.value) >= 90 ? '#4ade80' : '#fbbf24') : '#fbbf24', trend: carrier.trend },
    { label: 'Signature Compliance', value: sig.value, subtitle: sig.subtitle, color: sig.value === '—' ? 'rgba(255,255,255,0.25)' : sig.value.endsWith('%') ? (parseFloat(sig.value) >= 90 ? '#4ade80' : '#fbbf24') : '#fbbf24', trend: sig.trend },
    { label: 'Gateway Ready', value: ready.value, subtitle: ready.subtitle, color: '#818cf8', trend: ready.trend },
  ];
}

// ── Component ─────────────────────────────────────────────────────

export function ComplianceKpiRow({ data }: { data: ComplianceData }) {
  const kpis = useMemo(() => buildKpis(data), [data]);

  return (
    <div
      className="compliance-kpi-row"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
      }}
    >
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
            padding: '16px 20px',
            transition: 'border-color 0.15s',
            cursor: 'default',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: 8,
            }}
          >
            {kpi.label}
          </div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 26,
              fontWeight: 800,
              color: kpi.color,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {kpi.value}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)' }}>
              {kpi.subtitle}
            </span>
            <span
              style={{
                fontSize: 12,
                color: trendColor(kpi.trend),
                fontWeight: 700,
              }}
            >
              {trendArrow(kpi.trend)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
