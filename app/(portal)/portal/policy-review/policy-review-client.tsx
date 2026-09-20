'use client';

/**
 * T4 Client Ambiguity Dashboard — interactive UI component (ADR 0012 D5)
 *
 * Renders the list of unmapped clauses with Define / Exclude / Flag actions.
 * Actions are optimistic — the row disappears immediately, rolling back on error.
 */

import { useState, useTransition } from 'react';
import type { UnmappedClauseRow } from '@/lib/intelligence/policy-service';
import {
  defineClauseAction,
  excludeClauseAction,
  flagClauseAction,
} from './actions';
import { DefineClauseModal } from './define-clause-modal';

type Props = {
  clauses: UnmappedClauseRow[];
  error: string | null;
  clientId: string;
};

export function PolicyReviewClient({ clauses: initialClauses, error, clientId }: Props) {
  const [clauses, setClauses] = useState(initialClauses);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [definingClause, setDefiningClause] = useState<UnmappedClauseRow | null>(null);
  const [excludeReason, setExcludeReason] = useState('');
  const [excludingId, setExcludingId] = useState<string | null>(null);

  const removeClause = (id: string) => {
    setClauses(prev => prev.filter(c => c.id !== id));
  };

  const handleExclude = (clause: UnmappedClauseRow) => {
    startTransition(async () => {
      const result = await excludeClauseAction({
        scopeExclusionId: clause.id,
        reason: excludeReason || 'Client chose not to enforce this clause.',
      });
      if (result.success) {
        removeClause(clause.id);
        setFeedback({ type: 'success', message: result.message });
      } else {
        setFeedback({ type: 'error', message: result.error });
      }
      setExcludingId(null);
      setExcludeReason('');
    });
  };

  const handleFlag = (clause: UnmappedClauseRow) => {
    startTransition(async () => {
      const result = await flagClauseAction({
        scopeExclusionId: clause.id,
      });
      if (result.success) {
        removeClause(clause.id);
        setFeedback({ type: 'success', message: result.message });
      } else {
        setFeedback({ type: 'error', message: result.error });
      }
    });
  };

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Policy Review</h1>
        <div style={{
          background: 'rgba(248,113,113,0.1)',
          border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 8,
          padding: 16,
          color: '#fca5a5',
          fontSize: 13,
        }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 4,
          color: 'var(--ink-1)',
        }}>
          Policy Review
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          These clauses couldn&apos;t be automatically classified by our extraction pipeline.
          Review each one and choose to define a rule, exclude it from enforcement,
          or flag it for expert review.
        </p>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div style={{
          background: feedback.type === 'success'
            ? 'rgba(52,211,153,0.1)'
            : 'rgba(248,113,113,0.1)',
          border: `1px solid ${feedback.type === 'success' ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          color: feedback.type === 'success' ? '#34d399' : '#fca5a5',
          fontSize: 12.5,
        }}>
          {feedback.message}
        </div>
      )}

      {/* Empty state */}
      {clauses.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: 'var(--ink-1)' }}>
            All clauses reviewed
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            No pending policy clauses require your attention. New unmapped clauses
            will appear here after document processing.
          </p>
        </div>
      )}

      {/* Clause list */}
      {clauses.map((clause) => (
        <div key={clause.id} style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: 18,
          marginBottom: 12,
          opacity: isPending ? 0.6 : 1,
          transition: 'opacity 0.15s',
        }}>
          {/* Clause text */}
          <div style={{
            fontSize: 13.5,
            color: 'var(--ink-1)',
            lineHeight: 1.55,
            marginBottom: 12,
            fontStyle: 'italic',
            borderLeft: '3px solid rgba(94,106,210,0.4)',
            paddingLeft: 12,
          }}>
            &ldquo;{clause.clauseText}&rdquo;
          </div>

          {/* Meta */}
          <div style={{
            display: 'flex',
            gap: 16,
            marginBottom: 14,
            fontSize: 11.5,
            color: 'var(--ink-2)',
          }}>
            {clause.policyName && (
              <span>Policy: <strong style={{ color: 'var(--ink-1)' }}>{clause.policyName}</strong></span>
            )}
            <span>Added {new Date(clause.createdAt).toLocaleDateString()}</span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setDefiningClause(clause)}
              disabled={isPending}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid rgba(94,106,210,0.4)',
                background: 'rgba(94,106,210,0.1)',
                color: '#a5b4fc',
                fontSize: 12,
                fontWeight: 500,
                cursor: isPending ? 'not-allowed' : 'pointer',
              }}
            >
              Define rule
            </button>

            {excludingId === clause.id ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                <input
                  type="text"
                  value={excludeReason}
                  onChange={e => setExcludeReason(e.target.value)}
                  placeholder="Reason for exclusion..."
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: '#EDEDEF',
                    fontSize: 12,
                    outline: 'none',
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleExclude(clause);
                    if (e.key === 'Escape') { setExcludingId(null); setExcludeReason(''); }
                  }}
                />
                <button
                  onClick={() => handleExclude(clause)}
                  disabled={isPending}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(248,113,113,0.4)',
                    background: 'rgba(248,113,113,0.15)',
                    color: '#fca5a5',
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => { setExcludingId(null); setExcludeReason(''); }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--ink-2)',
                    fontSize: 11.5,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setExcludingId(clause.id)}
                  disabled={isPending}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid rgba(248,113,113,0.25)',
                    background: 'transparent',
                    color: 'var(--ink-2)',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Exclude
                </button>

                <button
                  onClick={() => handleFlag(clause)}
                  disabled={isPending}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'transparent',
                    color: 'var(--ink-2)',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Flag for review
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {/* Define Clause Modal */}
      {definingClause && (
        <DefineClauseModal
          clause={definingClause}
          onClose={() => setDefiningClause(null)}
          onSuccess={(id) => {
            removeClause(id);
            setFeedback({ type: 'success', message: 'Rule created as draft. Staff will review and activate.' });
          }}
          onError={(msg) => setFeedback({ type: 'error', message: msg })}
        />
      )}
    </div>
  );
}
