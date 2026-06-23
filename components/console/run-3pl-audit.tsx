'use client';

import { useActionState } from 'react';
import { runThreePLAuditAction, type RunResult } from '@/app/(console)/ingestion/3pl/actions';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export function RunThreePLAudit() {
  const [state, formAction, pending] = useActionState<RunResult, FormData>(runThreePLAuditAction, undefined);
  return (
    <form action={formAction} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button type="submit" disabled={pending} style={{
        background: 'var(--blue)', color: 'oklch(0.16 0.02 244)', border: 'none',
        borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13, fontWeight: 700,
        cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1,
      }}>{pending ? 'Auditing…' : 'Run 3PL audit'}</button>
      {state?.ok && (
        <span style={{ fontSize: 12.5, color: 'var(--green-ink)' }}>
          Checked {state.linesChecked} line(s) · {state.findingsCreated} finding(s) · {usd(state.totalVariance || 0)} flagged. See Queue.
        </span>
      )}
      {state && !state.ok && <span style={{ fontSize: 12.5, color: 'oklch(0.84 0.10 25)' }}>{state.error}</span>}
    </form>
  );
}
