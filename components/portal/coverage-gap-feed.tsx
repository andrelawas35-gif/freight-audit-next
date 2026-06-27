'use client';

import { useMemo, useState } from 'react';
import type { InsuranceExposureRow } from '@/lib/intelligence/reports';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ── Helpers ──────────────────────────────────────────────────────

const FILTERS = ['All', 'Signature', 'Declared Value', 'Carrier', 'Packaging', 'Other'] as const;

function humanizeCategory(cat: string): string {
  const map: Record<string, string> = {
    DECLARED_VALUE_MISMATCH: 'Declared Value Mismatch',
    SIGNATURE_REQUIRED_BUT_NOT_OBTAINED: 'Signature Required But Not Obtained',
    SIGNATURE_WAIVER_ABUSE: 'Signature Waiver Abuse',
    NO_SIGNATURE_ON_HIGH_VALUE: 'No Signature on High Value',
    MISSING_SIGNATURE: 'Missing Signature',
    CARRIER_INSURANCE_GAP: 'Carrier Insurance Gap',
    PACKAGING_INADEQUATE: 'Packaging Inadequate',
    PACKAGING_NON_COMPLIANT: 'Packaging Non-Compliant',
    CARRIER_LIABILITY_LIMIT_EXCEEDED: 'Carrier Liability Limit Exceeded',
    UNINSURED_HIGH_VALUE: 'Uninsured High Value',
    UNDERINSURED: 'Underinsured',
    INSURANCE_GAP: 'Insurance Gap',
  };
  // Fuzzy: try exact map, then case-insensitive partial
  if (map[cat]) return map[cat];
  const upper = cat.toUpperCase();
  for (const [k, v] of Object.entries(map)) {
    if (upper.includes(k) || k.includes(upper)) return v;
  }
  // Humanize snake_case / UPPER_SNAKE_CASE
  return cat
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ');
}

function matchesFilter(cat: string, filter: string): boolean {
  if (filter === 'All') return true;
  const upper = cat.toUpperCase();
  if (filter === 'Signature') return upper.includes('SIGNATURE');
  if (filter === 'Declared Value') return upper.includes('DECLARED') || upper.includes('VALUE');
  if (filter === 'Carrier') return upper.includes('CARRIER');
  if (filter === 'Packaging') return upper.includes('PACKAGING');
  if (filter === 'Other') {
    return !upper.includes('SIGNATURE')
      && !upper.includes('DECLARED')
      && !upper.includes('VALUE')
      && !upper.includes('CARRIER')
      && !upper.includes('PACKAGING');
  }
  return true;
}

interface FeedRow {
  category: string;
  humanName: string;
  shipmentCount: number;
  exposedValue: number;
  preventableExposure: number;
}

function buildFeed(rows: InsuranceExposureRow[]): FeedRow[] {
  const grouped = new Map<string, { shipmentCount: number; exposedValue: number; preventableExposure: number }>();
  for (const r of rows) {
    const cat = r.insurance_risk_category ?? 'Unknown';
    const prev = grouped.get(cat) ?? { shipmentCount: 0, exposedValue: 0, preventableExposure: 0 };
    prev.shipmentCount += r.shipment_count ?? 0;
    prev.exposedValue += r.exposed_value ?? 0;
    prev.preventableExposure += r.preventable_exposure ?? 0;
    grouped.set(cat, prev);
  }
  const list: FeedRow[] = [];
  for (const [cat, vals] of grouped) {
    list.push({
      category: cat,
      humanName: humanizeCategory(cat),
      shipmentCount: vals.shipmentCount,
      exposedValue: vals.exposedValue,
      preventableExposure: vals.preventableExposure,
    });
  }
  list.sort((a, b) => b.preventableExposure - a.preventableExposure);
  return list;
}

// ── Component ─────────────────────────────────────────────────────

export function CoverageGapFeed({ insuranceExposure }: { insuranceExposure: InsuranceExposureRow[] }) {
  const [filter, setFilter] = useState<string>('All');
  const allRows = useMemo(() => buildFeed(insuranceExposure), [insuranceExposure]);
  const filtered = useMemo(() => allRows.filter((r) => matchesFilter(r.category, filter)), [allRows, filter]);

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: '16px 20px',
      }}
    >
      {/* Title */}
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.25)',
          marginBottom: 14,
        }}
      >
        Coverage Gaps
      </div>

      {/* Filter chips + period label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          flexWrap: 'wrap' as const,
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.04em',
                padding: '3px 8px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: filter === f ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: filter === f ? '#EDEDEF' : 'rgba(255,255,255,0.3)',
                transition: 'all 0.1s',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
          Last 6 months
        </span>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0, fontStyle: 'italic' }}>
          No coverage gaps found in this period. Your shipments appear compliant.
        </p>
      ) : (
        <>
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
              gap: 8,
              paddingBottom: 8,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.25)' }}>Risk Category</span>
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.25)', textAlign: 'right' as const }}>Shipments</span>
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.25)', textAlign: 'right' as const }}>Exposed</span>
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.25)', textAlign: 'right' as const }}>At Risk</span>
          </div>

          {/* Rows */}
          {filtered.map((row) => (
            <div
              key={row.category}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr',
                gap: 8,
                padding: '10px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                transition: 'background 0.1s',
                cursor: 'default',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 12, color: '#EDEDEF' }}>{row.humanName}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: '#EDEDEF', textAlign: 'right' }}>{row.shipmentCount}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>{usd(row.exposedValue)}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: '#f87171', textAlign: 'right' }}>{usd(row.preventableExposure)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
