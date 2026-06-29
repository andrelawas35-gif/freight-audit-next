'use client';

import { useState } from 'react';
import type { GatewayReadinessRow, GatewayRuleSuggestionRow } from '@/lib/intelligence/reports';

// ── Helpers ──────────────────────────────────────────────────────

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

const simulationModes = [
  { key: 'advisory' as const, label: 'Advisory', multiplier: 1.0, description: 'Warn on every shipment' },
  { key: 'require-approval' as const, label: 'Require Approval', multiplier: 0.7, description: 'Flag for manager review' },
  { key: 'block' as const, label: 'Block', multiplier: 0.4, description: 'Prevent label purchase' },
];

// ── SectionCard (matching compliance-tab.tsx / dashboard.tsx) ────

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
                background: 'rgba(251,191,36,0.12)',
                color: '#fbbf24',
                border: '1px solid rgba(251,191,36,0.2)',
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

// ── GatewayReadinessPanel ─────────────────────────────────────────

export function GatewayReadinessPanel({
  gatewayReadiness,
  ruleSuggestions,
}: {
  gatewayReadiness: GatewayReadinessRow[];
  ruleSuggestions: GatewayRuleSuggestionRow[];
}) {
  const [mode, setMode] = useState<'advisory' | 'require-approval' | 'block'>('advisory');

  const totalExposure = gatewayReadiness.reduce((sum, r) => sum + (r.margin_lost || 0), 0);
  const totalRoi = gatewayReadiness.reduce((sum, r) => sum + (r.gateway_roi || 0), 0);
  const multiplier = simulationModes.find((m) => m.key === mode)?.multiplier ?? 1.0;
  const simulated = totalRoi * multiplier;
  const modeInfo = simulationModes.find((m) => m.key === mode);
  const hasData = totalExposure > 0 || ruleSuggestions.length > 0;

  return (
    <SectionCard title="Gateway Readiness" badge="SIMULATION">
      {!hasData ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Hero: What You Would Have Saved */}
          <div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.3)',
                marginBottom: 2,
              }}
            >
              What you would have saved
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 32,
                fontWeight: 800,
                color: '#4ade80',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                transition: 'all 0.3s ease',
              }}
            >
              {usd(simulated)}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
              Last 6 months · {modeInfo?.label} mode
            </div>
          </div>

          {/* Simulation mode selector */}
          <div>
            <div
              style={{
                fontSize: 9,
                fontFamily: 'var(--mono)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'rgba(255,255,255,0.25)',
                marginBottom: 8,
              }}
            >
              Enforcement Level
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {simulationModes.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  title={m.description}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: mode === m.key
                      ? '1px solid rgba(255,255,255,0.15)'
                      : '1px solid transparent',
                    cursor: 'pointer',
                    background:
                      mode === m.key
                        ? 'rgba(255,255,255,0.1)'
                        : 'transparent',
                    color:
                      mode === m.key ? '#EDEDEF' : 'rgba(255,255,255,0.3)',
                    transition: 'all 0.15s',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.22)', marginTop: 6, lineHeight: 1.5 }}>
              {modeInfo?.description}. Simulated savings adjust to reflect the percentage of
              shipments likely to comply when enforcement increases.
            </div>
          </div>

          {/* Top Rules to Activate */}
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'rgba(255,255,255,0.25)',
                marginBottom: 10,
              }}
            >
              Top Rules to Activate
            </div>
            {ruleSuggestions.length === 0 ? (
              <p
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.3)',
                  margin: 0,
                }}
              >
                No rule suggestions yet. Rules are generated from audit findings
                tagged as preventable by a pre-shipment gateway.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ruleSuggestions.slice(0, 5).map((rule, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom:
                        i < Math.min(ruleSuggestions.length, 5) - 1
                          ? '1px solid rgba(255,255,255,0.04)'
                          : 'none',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#EDEDEF',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {rule.gateway_rule_suggestion || rule.gateway_category || 'Unnamed rule'}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: 'rgba(255,255,255,0.3)',
                          marginTop: 2,
                        }}
                      >
                        {rule.findings} finding{rule.findings !== 1 ? 's' : ''} · {rule.gateway_category}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#4ade80',
                        marginLeft: 12,
                        flexShrink: 0,
                      }}
                    >
                      {usd(rule.gateway_roi)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Disclaimer + CTA */}
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.22)',
                lineHeight: 1.5,
              }}
            >
              This is a <strong style={{ color: 'rgba(255,255,255,0.35)' }}>simulation</strong> based
              on your historical shipment and audit data. The gateway is not yet active on your
              account — no shipments are being blocked or flagged in real time. Activation is
              managed by your Aurelian Collective account team after ruleset validation.
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.18)',
                fontStyle: 'italic',
              }}
            >
              Ready to activate? Contact your account manager to validate these rules
              and enable pre-shipment enforcement.
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p
        style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.3)',
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        No gateway-ready rules have been identified for your account yet. This report
        populates once our audit engine tags findings with gateway preventability metadata
        and your policy rulesets are backtested against historical shipments.
      </p>
      <p
        style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.2)',
          margin: 0,
          fontStyle: 'italic',
        }}
      >
        This is normal for new accounts. Gateway readiness reporting begins after your
        first audit run produces findings tagged as preventable by a pre-shipment check.
      </p>
    </div>
  );
}
