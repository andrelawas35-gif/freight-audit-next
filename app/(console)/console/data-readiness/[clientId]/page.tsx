import { getDataReadinessReport } from '@/lib/intelligence/reports';
import { notFound } from 'next/navigation';
import { ConsoleErrorState } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';

// ── Helpers ──────────────────────────────────────────────────────

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

function pct(n: number): string {
  return Math.round((1 - n) * 100) + '%';
}

function completenessColor(nullRate: number): string {
  const rate = 1 - nullRate;
  if (rate >= 0.9) return '#22c55e';
  if (rate >= 0.7) return '#facc15';
  return '#ef4444';
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

// ── Page ─────────────────────────────────────────────────────────

export default async function DataReadinessPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  try {
    const report = await getDataReadinessReport(clientId);

    if (!report) {
      notFound();
    }

    const criticalFields = report.fields.filter(
      (f) => f.requiredByRulesCount > 0 && f.nullRate > 0.5,
    );
    const blockedRules = criticalFields.reduce((s, f) => s + f.requiredByRulesCount, 0);
    const tierLabel =
      report.assessmentTier === 'compliance_risk_assessment'
        ? 'Full Compliance Risk Assessment'
        : 'Data Maturity Audit';
    const tierColor =
      report.assessmentTier === 'compliance_risk_assessment' ? '#22c55e' : '#facc15';

    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 0' }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.25)',
              marginBottom: 4,
            }}
          >
            Data Maturity Audit
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
              margin: 0,
              marginBottom: 4,
            }}
          >
            Client: {clientId}
          </h1>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            Generated {new Date(report.generatedAt).toLocaleString('en-US')}
          </div>
        </div>

        {/* Hero card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 24,
            padding: '20px 24px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: `4px solid ${completenessColor(1 - report.overallCompletenessScore)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 20,
                fontWeight: 700,
                color: completenessColor(1 - report.overallCompletenessScore),
              }}
            >
              {Math.round(report.overallCompletenessScore * 100)}%
            </span>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
              Overall Data Completeness Score
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
              {report.fields.length} fields assessed across{' '}
              {report.fields[0]?.totalShipments ?? 0} shipments
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
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
            marginBottom: 24,
            padding: '10px 14px',
            borderRadius: 8,
            background: `${tierColor}10`,
            border: `1px solid ${tierColor}25`,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: tierColor,
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 14, color: tierColor, fontWeight: 600 }}>
              {report.assessmentTier === 'compliance_risk_assessment'
                ? 'Qualifies for Full Compliance Risk Assessment ($1,000)'
                : 'Qualifies for Data Maturity Audit ($500)'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              {report.recommendation}
            </div>
          </div>
        </div>

        {/* Per-field detail */}
        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12,
            padding: '20px 24px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.2)',
              marginBottom: 16,
            }}
          >
            Field Detail
          </div>

          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr',
              gap: 12,
              padding: '0 0 8px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              marginBottom: 8,
            }}
          >
            {['Field', 'Completeness', 'Rules Dependent', 'Status'].map((h) => (
              <div
                key={h}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'rgba(255,255,255,0.2)',
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Table rows */}
          {report.fields
            .slice()
            .sort((a, b) => a.nullRate - b.nullRate)
            .map((field) => {
              const label = FIELD_LABELS[field.field] || field.field;
              const color = completenessColor(field.nullRate);
              const status = completenessLabel(field.nullRate);

              return (
                <div
                  key={field.field}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.02)',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>
                      {label}
                    </div>
                    {field.dependentRules.length > 0 && (
                      <div
                        style={{
                          marginTop: 2,
                          fontFamily: 'var(--mono)',
                          fontSize: 9,
                          color: 'rgba(255,255,255,0.25)',
                        }}
                      >
                        {field.dependentRules.slice(0, 2).map((r, i) => (
                          <span key={i}>
                            {i > 0 && ', '}
                            {r.ruleKey}
                          </span>
                        ))}
                        {field.dependentRules.length > 2 && (
                          <span> +{field.dependentRules.length - 2} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 13,
                        fontWeight: 600,
                        color,
                      }}
                    >
                      {pct(field.nullRate)}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 9,
                        color: 'rgba(255,255,255,0.2)',
                      }}
                    >
                      {field.nonNullShipments}/{field.totalShipments}
                    </div>
                  </div>
                  <div>
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 13,
                        fontWeight: 600,
                        color:
                          field.requiredByRulesCount > 0
                            ? 'rgba(255,255,255,0.7)'
                            : 'rgba(255,255,255,0.2)',
                      }}
                    >
                      {field.requiredByRulesCount}
                    </span>
                  </div>
                  <div>
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
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
              );
            })}
        </div>
      </div>
    );
  } catch (err) {
    return (
      <ConsoleErrorState
        heading="Data Readiness report unavailable"
        message={err instanceof Error ? err.message : String(err)}
        hint="Ensure the client has shipments uploaded and the database is accessible."
      />
    );
  }
}
