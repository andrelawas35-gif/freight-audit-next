'use client';

import { useMemo } from 'react';
import type { ComplianceData } from '@/lib/portal/data-loader';
import type { GatewayReadinessRow } from '@/lib/intelligence/reports';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ── Helpers ──────────────────────────────────────────────────────

function humanizeCategory(cat: string): string {
  const map: Record<string, string> = {
    SOP_PROCEDURE_VIOLATION: 'SOP Procedure Violation',
    PACKAGING_COMPLIANCE: 'Packaging Compliance',
    SIGNATURE_POLICY: 'Signature Policy',
    CARRIER_AUTHORIZATION: 'Carrier Authorization',
    CARRIER_QUALIFICATION: 'Carrier Qualification',
    INSURANCE_COMPLIANCE: 'Insurance Compliance',
    DECLARED_VALUE_POLICY: 'Declared Value Policy',
    DIM_WEIGHT_COMPLIANCE: 'Dim Weight Compliance',
  };
  if (map[cat]) return map[cat];
  return cat
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ');
}

function marginColor(margin: number): string {
  if (margin <= 0) return '#4ade80';
  if (margin < 1000) return '#fbbf24';
  return '#f87171';
}

interface WarehouseRow {
  category: string;
  humanName: string;
  findings: number;
  marginLost: number;
}

interface WarehouseColumn {
  name: string;
  rows: WarehouseRow[];
}

function splitToWarehouses(
  categories: { category: string; findings: number; marginLost: number }[],
): WarehouseColumn[] {
  const a: WarehouseRow[] = [];
  const b: WarehouseRow[] = [];

  for (const c of categories) {
    const row: WarehouseRow = {
      category: c.category,
      humanName: humanizeCategory(c.category),
      findings: c.findings,
      marginLost: c.marginLost,
    };
    const first = (c.category[0] || '').toUpperCase();
    if (first >= 'A' && first <= 'M') {
      a.push(row);
    } else {
      b.push(row);
    }
  }

  const cols: WarehouseColumn[] = [];
  if (a.length > 0) cols.push({ name: 'Warehouse A', rows: a });
  if (b.length > 0) cols.push({ name: 'Warehouse B', rows: b });
  return cols;
}

// ── Component ─────────────────────────────────────────────────────

export function WarehouseScorecard({ data }: { data: ComplianceData }) {
  const columns = useMemo(() => {
    // Group gatewayReadiness by gateway_category
    const grouped = new Map<string, { findings: number; marginLost: number }>();
    for (const r of data.gatewayReadiness) {
      const cat = r.gateway_category ?? 'Unknown';
      const prev = grouped.get(cat) ?? { findings: 0, marginLost: 0 };
      prev.findings += r.findings ?? 0;
      prev.marginLost += r.margin_lost ?? 0;
      grouped.set(cat, prev);
    }
    const cats = [...grouped.entries()].map(([category, vals]) => ({
      category,
      findings: vals.findings,
      marginLost: vals.marginLost,
    }));
    return splitToWarehouses(cats);
  }, [data.gatewayReadiness]);

  const isEmpty = columns.length === 0;
  const hasSingleCol = columns.length === 1;

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
        Warehouse Scorecard
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0, fontStyle: 'italic' }}>
          No warehouse data available. Warehouse-level compliance scoring will appear once
          fulfillment center identifiers are configured on your shipments.
        </p>
      ) : (
        <>
          {/* Two-column grid — or single-column if only one warehouse */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: hasSingleCol ? '1fr' : '1fr 1fr',
              gap: 12,
            }}
          >
            {columns.map((col) => (
              <div key={col.name}>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.04em',
                    color: 'rgba(255,255,255,0.5)',
                    marginBottom: 10,
                  }}
                >
                  {col.name}
                </div>

                {/* Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr',
                    gap: 8,
                    paddingBottom: 6,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.2)' }}>Category</span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.2)', textAlign: 'right' as const }}>Findings</span>
                  <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.2)', textAlign: 'right' as const }}>Margin Lost</span>
                </div>

                {/* Rows */}
                {col.rows.map((row) => (
                  <div
                    key={row.category}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr',
                      gap: 8,
                      padding: '8px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <span style={{ fontSize: 11.5, color: '#EDEDEF' }}>{row.humanName}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, color: '#EDEDEF', textAlign: 'right' }}>{row.findings}</span>
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: marginColor(row.marginLost),
                        textAlign: 'right',
                      }}
                    >
                      {usd(row.marginLost)}
                    </span>
                  </div>
                ))}

                {col.rows.length === 0 && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0, fontStyle: 'italic' }}>
                    No categories assigned.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Footnote */}
          <p
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.2)',
              margin: 0,
              marginTop: 12,
              fontStyle: 'italic',
            }}
          >
            Per-warehouse breakdown requires warehouse-level tagging. Contact your account manager to
            configure warehouse identifiers on your shipment data.
          </p>
        </>
      )}
    </div>
  );
}
