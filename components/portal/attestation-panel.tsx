'use client';

import { useState, useEffect, useTransition } from 'react';
import type { AttestationRecord, AttestationData } from '@/lib/portal/attestation';
import { getAttestationData, attestRuleset } from '@/lib/portal/attestation';

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

// ── Helpers ──────────────────────────────────────────────────────

function truncateEmail(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── AttestationPanel ─────────────────────────────────────────────

export function AttestationPanel({ clientId }: { clientId: string }) {
  const [data, setData] = useState<AttestationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attesting, startAttestation] = useTransition();
  const [attestMsg, setAttestMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAttestationData(clientId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const hasCurrent = data && data.current.length > 0;
  const hasPending = data && data.pendingCount > 0;
  const isLoading = data === null && error === null;

  // Placeholder attest — wires to first pending ruleset (to be wired to actual selection UI)
  function handleAttest() {
    setAttestMsg(null);
    startAttestation(async () => {
      try {
        const result = await attestRuleset(clientId, 'placeholder-ruleset-id', 'Client attestation');
        if (result.success) {
          setAttestMsg('Attestation recorded successfully.');
          // Refresh data
          const refreshed = await getAttestationData(clientId);
          setData(refreshed);
        } else {
          setAttestMsg(result.error || 'Attestation failed.');
        }
      } catch (err) {
        setAttestMsg(String(err));
      }
    });
  }

  return (
    <SectionCard title="Attestation">
      {isLoading ? (
        <p
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.3)',
            margin: 0,
            fontStyle: 'italic',
          }}
        >
          Loading attestation data…
        </p>
      ) : error ? (
        <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>
          Failed to load attestation data: {error}
        </p>
      ) : !hasCurrent && !hasPending ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Pending attestations alert */}
          {hasPending && (
            <div
              style={{
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.2)',
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 12, color: '#fbbf24' }}>
                {data!.pendingCount} polic{data!.pendingCount === 1 ? 'y' : 'ies'} need
                {data!.pendingCount === 1 ? 's' : ''} your review
              </span>
              <button
                onClick={handleAttest}
                disabled={attesting}
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(251,191,36,0.3)',
                  cursor: attesting ? 'not-allowed' : 'pointer',
                  background: attesting
                    ? 'rgba(251,191,36,0.06)'
                    : 'rgba(251,191,36,0.12)',
                  color: '#fbbf24',
                  opacity: attesting ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {attesting ? 'Submitting…' : 'Review'}
              </button>
            </div>
          )}

          {attestMsg && (
            <div
              style={{
                fontSize: 11,
                color: attestMsg.includes('success') ? '#4ade80' : '#f87171',
              }}
            >
              {attestMsg}
            </div>
          )}

          {/* Current attested policies */}
          {hasCurrent && (
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
                Current Attested Policies
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data!.current.map((att: AttestationRecord) => (
                  <div
                    key={att.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
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
                        {att.scope_statement || `Ruleset ${att.ruleset_id}`}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: 'rgba(255,255,255,0.3)',
                          marginTop: 2,
                        }}
                      >
                        {formatDate(att.attested_at)} · {truncateEmail(att.attested_by)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p
        style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.3)',
          margin: 0,
          fontStyle: 'italic',
        }}
      >
        No policies attested. Upload your insurance policy documents to begin.
      </p>
      <p
        style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.2)',
          margin: 0,
        }}
      >
        Visit the Upload page to add policy documents.
      </p>
    </div>
  );
}
