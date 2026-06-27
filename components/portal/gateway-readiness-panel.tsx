'use client';

import { useState } from 'react';
import type { GatewayReadinessRow, GatewayRuleSuggestionRow } from '@/lib/intelligence/reports';

// ── Helpers ──────────────────────────────────────────────────────

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

const simulationModes = [
  { key: 'advisory' as const, label: 'Advisory', multiplier: 1.0 },
  { key: 'require-approval' as const, label: 'Require Approval', multiplier: 0.7 },
  { key: 'block' as const, label: 'Block', multiplier: 0.4 },
];

// ── SectionCard (matching compliance-tab.tsx / dashboard.tsx) ────

function SectionCard({
  title,
  children,
}: {
  title?: string;
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
      {title && (
        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.25)',
            marginBottom: 14,
          }}
        >
          {title}
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
  const multiplier = simulationModes.find((m) => m.key === mode)?.multiplier ?? 1.0;
  const simulated = totalExposure * multiplier;

  const hasData = totalExposure > 0 || ruleSuggestions.length > 0;

  return (
    <SectionCard title="Gateway Readiness">
      {!hasData ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Hero number */}
          <div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.3)',
                marginBottom: 4,
              }}
            >
              Preventable Exposure
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
              Last 6 months
            </div>
          </div>

          {/* Simulation toggle */}
          <div style={{ display: 'flex', gap: 4 }}>
            {simulationModes.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
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

          {/* Top Rules to Activate */}
          <div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'rgba(255,255,255,0.3)',
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
                No rule suggestions available.
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
                        {rule.findings} finding{rule.findings !== 1 ? 's' : ''}
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
        </div>
      )}
    </SectionCard>
  );
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <p
      style={{
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        margin: 0,
        fontStyle: 'italic',
      }}
    >
      No gateway-ready rules found. Run a backtest to populate readiness data.
    </p>
  );
}
