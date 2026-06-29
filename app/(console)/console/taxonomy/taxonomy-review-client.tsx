'use client';

import { useState, useTransition } from 'react';
import type { TaxonomyCandidateRow } from '@/lib/intelligence/policy-service';
import { promoteCandidateAction, rejectCandidateAction } from './actions';
import { Card } from '@/components/ui/primitives';

// ── Types ───────────────────────────────────────────────────────────

interface Props {
  candidates: TaxonomyCandidateRow[];
  isTaxonomyAdmin: boolean;
  counts: { captured: number; extractable: number; enforceable: number; rejected: number };
}

const STATUS_COLORS: Record<string, string> = {
  captured: 'var(--amber-ink)',
  extractable: 'var(--blue-ink)',
  enforceable: 'var(--green-ink)',
  rejected: 'var(--ink-3)',
};

// ── Component ───────────────────────────────────────────────────────

export function TaxonomyReviewClient({ candidates, isTaxonomyAdmin, counts }: Props) {
  const [isPending, startTransition] = useTransition();
  const [rejectState, setRejectState] = useState<{ id: string; reason: string } | null>(null);
  const [messages, setMessages] = useState<{ id: string; text: string; ok: boolean }[]>([]);

  const addMessage = (id: string, text: string, ok: boolean) => {
    setMessages(prev => [...prev, { id, text, ok }]);
    setTimeout(() => setMessages(prev => prev.filter(m => m.id !== id)), 4000);
  };

  const handlePromote = (candidateId: string) => {
    startTransition(async () => {
      const result = await promoteCandidateAction(candidateId);
      addMessage(candidateId, result.ok ? 'Promoted to extractable' : (result.error ?? 'Failed'), result.ok);
    });
  };

  const handleReject = (candidateId: string, reason: string) => {
    startTransition(async () => {
      const result = await rejectCandidateAction(candidateId, reason);
      addMessage(candidateId, result.ok ? 'Rejected' : (result.error ?? 'Failed'), result.ok);
    });
  };

  return (
    <div style={{ padding: '0 0 24px', maxWidth: 1340, margin: '0 auto', width: '100%' }}>
      {/* ── KPI Row ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <Card style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 4 }}>
            Captured
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: STATUS_COLORS.captured }}>{counts.captured}</div>
        </Card>
        <Card style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 4 }}>
            Extractable
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: STATUS_COLORS.extractable }}>{counts.extractable}</div>
        </Card>
        <Card style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 4 }}>
            Enforceable (code)
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: STATUS_COLORS.enforceable }}>{counts.enforceable}</div>
        </Card>
        <Card style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 4 }}>
            Rejected
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: STATUS_COLORS.rejected }}>{counts.rejected}</div>
        </Card>
      </div>

      {/* ── Candidate table ──────────────────────── */}
      {candidates.length === 0 ? (
        <Card style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>
          No taxonomy candidates yet. Run the extraction pipeline to discover novel policy variables.
        </Card>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={th}>Candidate Rule Key</th>
              <th style={th}>Source Clause</th>
              <th style={th}>Seen</th>
              <th style={th}>Status</th>
              <th style={{ ...th, width: 180 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', opacity: isPending ? 0.6 : 1 }}>
                <td style={td}>
                  <code style={{ fontSize: 12, background: 'var(--bg-2)', padding: '1px 6px', borderRadius: 3 }}>
                    {c.ruleKey}
                  </code>
                  {c.inferredType && (
                    <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 8 }}>
                      {c.inferredType}{c.inferredBounds ? ` ${JSON.stringify(c.inferredBounds)}` : ''}
                    </span>
                  )}
                </td>
                <td style={{ ...td, maxWidth: 400 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.sourceClause}>
                    {c.sourceClause}
                  </div>
                </td>
                <td style={{ ...td, textAlign: 'center' }}>{c.seenCount}</td>
                <td style={td}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: STATUS_COLORS[c.lifecycleStatus] ?? 'var(--ink-2)',
                    textTransform: 'uppercase',
                  }}>
                    {c.lifecycleStatus}
                  </span>
                </td>
                <td style={td}>
                  {c.lifecycleStatus === 'captured' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isTaxonomyAdmin && (
                        <button
                          onClick={() => handlePromote(c.id)}
                          disabled={isPending}
                          style={btnStyle('var(--green-ink)', 'var(--green-bg)')}
                        >
                          Promote
                        </button>
                      )}
                      {rejectState?.id === c.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            autoFocus
                            placeholder="Why?"
                            value={rejectState.reason}
                            onChange={e => setRejectState({ id: c.id, reason: e.target.value })}
                            style={{ width: 100, fontSize: 12, padding: '2px 6px' }}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && rejectState.reason.trim()) {
                                handleReject(c.id, rejectState.reason.trim());
                                setRejectState(null);
                              }
                              if (e.key === 'Escape') setRejectState(null);
                            }}
                          />
                          <button
                            onClick={() => {
                              if (rejectState.reason.trim()) handleReject(c.id, rejectState.reason.trim());
                              setRejectState(null);
                            }}
                            style={btnStyle('var(--red-ink)', 'var(--red-bg)')}
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRejectState({ id: c.id, reason: '' })}
                          disabled={isPending}
                          style={btnStyle('var(--ink-3)', 'var(--bg-2)')}
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  )}
                  {c.lifecycleStatus === 'rejected' && c.rejectReason && (
                    <span style={{ fontSize: 11, color: 'var(--ink-3)' }} title={c.rejectReason}>
                      {c.rejectReason.length > 40 ? c.rejectReason.slice(0, 40) + '…' : c.rejectReason}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Toast messages ────────────────────────── */}
      {messages.length > 0 && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 100 }}>
          {messages.map(m => (
            <Card key={m.id} style={{
              padding: '8px 16px',
              borderLeft: `3px solid ${m.ok ? 'var(--green-ink)' : 'var(--red-ink)'}`,
              fontSize: 13,
            }}>
              {m.text}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--ink-3)',
};

const td: React.CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'middle',
};

function btnStyle(color: string, bg: string): React.CSSProperties {
  return {
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 500,
    color,
    background: bg,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  };
}
