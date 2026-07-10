'use client';

import type { DataReadinessReport, DataReadinessField } from '@/lib/intelligence/reports';

// ── Helpers ──────────────────────────────────────────────────────

function pct(n: number): string {
  return Math.round((1 - n) * 100) + '%';
}

function completenessColor(nullRate: number): string {
  const rate = 1 - nullRate;
  if (rate >= 0.9) return '#22c55e'; // green
  if (rate >= 0.7) return '#facc15'; // yellow
  return '#ef4444'; // red
}

function completenessLabel(nullRate: number): string {
  const rate = 1 - nullRate;
  if (rate >= 0.9) return 'Good';
  if (rate >= 0.7) return 'Fair';
  return 'Sparse';
}

const FIELD_LABELS: Record<string, string> = {
  'Declared value': 'Declared Value',
  'Insured value': 'Insured Value',
  Carrier: 'Carrier',
  'Service level': 'Service Level',
  'Shipper vertical': 'Shipper Vertical',
  'Commodity type': 'Commodity Type',
  'Destination country': 'Destination Country',
  'Destination zip': 'Destination Zip',
  'Destination risk tier': 'Destination Risk Tier',
  'Signature type': 'Signature Type',
  'Documentation received': 'Documentation Received',
  'Package type': 'Package Type',
};

// ── SectionCard ──────────────────────────────────────────────────

function SectionCard({
  title,
  badge,
  children,
}: {
  title?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: '16px 20px',
      }}
    >
      {(title || badge) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          {title && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'rgba(255,255,255,0.25)',
              }}
            >
              {title}
            </div>
          )}
          {badge && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 8,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '2px 7px',
                borderRadius: 9999,
                background: 'rgba(59,130,246,0.12)',
                color: '#60a5fa',
                border: '1px solid rgba(59,130,246,0.2)',
              }}
            >
              {badge}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Field bar ────────────────────────────────────────────────────

function FieldBar({ field }: { field: DataReadinessField }) {
  const completeness = 1 - field.nullRate;
  const label = FIELD_LABELS[field.field] || field.field;
  const color = completenessColor(field.nullRate);
  const status = completenessLabel(field.nullRate);

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {field.requiredByRulesCount > 0 && (
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              {field.requiredByRulesCount} rule{field.requiredByRulesCount > 1 ? 's' : ''}
            </span>
          )}
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              fontWeight: 600,
              color,
            }}
          >
            {pct(field.nullRate)}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              padding: '1px 6px',
              borderRadius: 9999,
              background: `${color}18`,
              color,
              border: `1px solid ${color}30`,
            }}
          >
            {status}
          </span>
        </div>
      </div>
      {/* Progress bar */}
      <div
        style={{
          width: '100%',
          height: 4,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.round(completeness * 100)}%`,
            height: '100%',
            borderRadius: 2,
            background: color,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      {/* Dependent rules detail */}
      {field.dependentRules.length > 0 && (
        <div style={{ marginTop: 3, paddingLeft: 2 }}>
          {field.dependentRules.slice(0, 3).map((r, i) => (
            <div
              key={i}
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: 'rgba(255,255,255,0.3)',
                lineHeight: 1.5,
              }}
            >
              &bull; {r.ruleKey}&nbsp;
              <span style={{ color: 'rgba(255,255,255,0.18)' }}>
                ({r.category})
              </span>
            </div>
          ))}
          {field.dependentRules.length > 3 && (
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                color: 'rgba(255,255,255,0.2)',
              }}
            >
              +{field.dependentRules.length - 3} more rules
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DataReadinessPanel ───────────────────────────────────────────

export function DataReadinessPanel({
  dataReadiness,
}: {
  dataReadiness: DataReadinessReport | null;
}) {
  if (!dataReadiness) {
    return (
      <SectionCard title="Data Maturity">
        <div style={{ padding: '20px 0', textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.3)',
              marginBottom: 8,
            }}
          >
            No shipment data available yet
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            Shipment data will appear here once you upload your first batch.
          </div>
        </div>
      </SectionCard>
    );
  }

  const criticalFields = dataReadiness.fields.filter(
    (f) => f.requiredByRulesCount > 0 && f.nullRate > 0.5,
  );
  const blockedRules = criticalFields.reduce((s, f) => s + f.requiredByRulesCount, 0);
  const tierLabel =
    dataReadiness.assessmentTier === 'compliance_risk_assessment'
      ? 'Full Compliance Risk Assessment'
      : 'Data Maturity Audit';
  const tierColor =
    dataReadiness.assessmentTier === 'compliance_risk_assessment' ? '#22c55e' : '#facc15';

  return (
    <SectionCard title="Data Maturity" badge={tierLabel}>
      {/* Hero score */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 18,
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 8,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: `3px solid ${completenessColor(1 - dataReadiness.overallCompletenessScore)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 16,
              fontWeight: 700,
              color: completenessColor(1 - dataReadiness.overallCompletenessScore),
            }}
          >
            {Math.round(dataReadiness.overallCompletenessScore * 100)}%
          </span>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
            Overall Completeness Score
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
            {blockedRules > 0
              ? `${blockedRules} active rule${blockedRules > 1 ? 's' : ''} blocked by missing data`
              : 'All active rules have sufficient data'}
          </div>
        </div>
      </div>

      {/* Assessment tier */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          padding: '8px 12px',
          borderRadius: 6,
          background: `${tierColor}10`,
          border: `1px solid ${tierColor}25`,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: tierColor,
            flexShrink: 0,
          }}
        />
        <div style={{ fontSize: 12, color: tierColor, fontWeight: 500 }}>
          {dataReadiness.assessmentTier === 'compliance_risk_assessment'
            ? 'Qualifies for Full Compliance Risk Assessment ($1,000)'
            : 'Qualifies for Data Maturity Audit ($500)'}
        </div>
      </div>

      {/* Recommendation */}
      <div
        style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.5)',
          lineHeight: 1.5,
          marginBottom: 18,
        }}
      >
        {dataReadiness.recommendation}
      </div>

      {/* Per-field bars */}
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.2)',
          marginBottom: 10,
        }}
      >
        Field Completeness
      </div>
      {dataReadiness.fields
        .slice()
        .sort((a, b) => a.nullRate - b.nullRate)
        .map((field) => (
          <FieldBar key={field.field} field={field} />
        ))}
    </SectionCard>
  );
}
