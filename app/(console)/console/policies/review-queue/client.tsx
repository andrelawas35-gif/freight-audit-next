'use client';

import { useState } from 'react';
import type { ReviewQueueRow } from './actions';
import { approveRuleAction, rejectRuleAction } from './actions';

export function ReviewQueueClient({ rules }: { rules: ReviewQueueRow[] }) {
  const [items, setItems] = useState(rules);
  const [message, setMessage] = useState<string | null>(null);

  async function handleApprove(ruleId: string) {
    const result = await approveRuleAction(ruleId);
    if (result.ok) {
      setItems(prev => prev.filter(r => r.id !== ruleId));
      setMessage('Rule approved. It is now attestable.');
    } else {
      setMessage(result.error ?? 'Failed to approve.');
    }
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleReject(ruleId: string) {
    const result = await rejectRuleAction(ruleId);
    if (result.ok) {
      setItems(prev => prev.filter(r => r.id !== ruleId));
      setMessage('Rule rejected and archived.');
    } else {
      setMessage(result.error ?? 'Failed to reject.');
    }
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Client-Defined Rules — Pending Review
      </h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Rules authored by clients via the T4 ambiguity dashboard.
        These rules are excluded from activation until staff review is complete (ADR 0015).
      </p>

      {message && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          borderRadius: '6px',
          backgroundColor: message.includes('Failed') ? '#fef2f2' : '#f0fdf4',
          color: message.includes('Failed') ? '#991b1b' : '#166534',
          border: `1px solid ${message.includes('Failed') ? '#fecaca' : '#bbf7d0'}`,
        }}>
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#999',
          border: '1px dashed #ddd',
          borderRadius: '8px',
        }}>
          No rules pending review.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
            {items.length} rule{items.length !== 1 ? 's' : ''} pending review
          </div>
          {items.map(rule => (
            <div key={rule.id} style={{
              padding: '1rem',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              backgroundColor: '#fff',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <strong style={{ fontSize: '0.95rem' }}>{rule.ruleKey}</strong>
                  <span style={{
                    marginLeft: '0.5rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                  }}>
                    {rule.category}
                  </span>
                  <span style={{
                    marginLeft: '0.5rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    backgroundColor: '#dbeafe',
                    color: '#1e40af',
                  }}>
                    {rule.severity}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleApprove(rule.id)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: '1px solid #166534',
                      backgroundColor: '#f0fdf4',
                      color: '#166534',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(rule.id)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '4px',
                      border: '1px solid #991b1b',
                      backgroundColor: '#fef2f2',
                      color: '#991b1b',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>
                Client: {rule.clientName || rule.clientId} · Created: {rule.createdAt}
                {rule.clauseRef && <> · Ref: {rule.clauseRef}</>}
              </div>
              {rule.sourceClauseText && (
                <div style={{
                  fontSize: '0.8rem',
                  color: '#555',
                  padding: '0.5rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '4px',
                  fontStyle: 'italic',
                  marginBottom: '0.5rem',
                }}>
                  &ldquo;{rule.sourceClauseText}&rdquo;
                </div>
              )}
              <details style={{ fontSize: '0.75rem', color: '#777' }}>
                <summary>Condition JSON</summary>
                <pre style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(rule.conditionJson, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
