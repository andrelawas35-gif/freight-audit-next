'use client';

import { useState, useTransition } from 'react';
import { parseResponse, applyOutcome } from '@/app/(console)/console/disputes/actions';
import type { DisputeOutcome } from '@/lib/disputes/response-parser';

type OpenDispute = { id: string; displayId: string; carrier: string; amount: number };

const OUTCOMES: { value: DisputeOutcome; label: string }[] = [
  { value: 'won', label: 'Won (full credit)' },
  { value: 'partial', label: 'Partial credit' },
  { value: 'denied', label: 'Denied' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'unclear', label: 'Unclear' },
];

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-sunk)', border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 13, color: 'var(--ink)',
};
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export function ResponseParser({ disputes, parserEnabled }: { disputes: OpenDispute[]; parserEnabled: boolean }) {
  const [disputeId, setDisputeId] = useState('');
  const [email, setEmail] = useState('');
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // reviewed/editable suggestion
  const [outcome, setOutcome] = useState<DisputeOutcome | ''>('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);

  const parse = () => start(async () => {
    setErr(null); setDone(null);
    if (!disputeId) { setErr('Pick a dispute first.'); return; }
    const res = await parseResponse(disputeId, email);
    if (!res.ok) { setErr(res.error); return; }
    setOutcome(res.outcome);
    setAmount(res.recoveryAmount != null ? String(res.recoveryAmount) : '');
    setNotes(res.reasoning);
    setConfidence(res.confidence);
  });

  const apply = () => start(async () => {
    setErr(null); setDone(null);
    if (!outcome) { setErr('No outcome to apply.'); return; }
    const res = await applyOutcome({
      disputeId,
      outcome,
      recoveryAmount: amount === '' ? null : Number(amount),
      notes,
      sourceText: email,
      confidence: confidence ?? undefined,
    });
    if (!res.ok) { setErr(res.error); return; }
    setDone('Outcome applied and recorded.');
    setEmail(''); setOutcome(''); setAmount(''); setNotes(''); setConfidence(null);
  });

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 700 }}>Carrier reply → outcome</h2>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          paste the carrier's email; AI suggests the outcome for your review
          {!parserEnabled && ' · AI off (set ANTHROPIC_API_KEY)'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select value={disputeId} onChange={(e) => setDisputeId(e.target.value)} style={inputStyle}>
            <option value="">— select open dispute —</option>
            {disputes.map((d) => (
              <option key={d.id} value={d.id}>{d.displayId} · {d.carrier} · {usd(d.amount)}</option>
            ))}
          </select>
          <textarea
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Paste the carrier's reply email here…"
            rows={7}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button
            onClick={parse}
            disabled={pending || !parserEnabled}
            style={{
              alignSelf: 'flex-start', background: 'var(--blue)', color: 'oklch(0.16 0.02 244)',
              border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13,
              fontWeight: 700, cursor: pending || !parserEnabled ? 'default' : 'pointer', opacity: pending || !parserEnabled ? 0.6 : 1,
            }}
          >
            {pending ? 'Parsing…' : 'Parse reply'}
          </button>
        </div>

        {/* Reviewed suggestion */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)' }}>Outcome</span>
            {confidence != null && (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-ink)', background: 'var(--blue-soft)', borderRadius: 'var(--radius-pill)', padding: '1px 7px' }}>
                AI {confidence}%
              </span>
            )}
          </div>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as DisputeOutcome)} style={inputStyle}>
            <option value="">—</option>
            {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)' }}>Recovery amount</label>
          <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
          <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)' }}>Resolution notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          <button
            onClick={apply}
            disabled={pending || !outcome}
            style={{
              alignSelf: 'flex-start', background: 'transparent', border: '1px solid var(--green-line)',
              color: 'var(--green-ink)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13,
              fontWeight: 700, cursor: pending || !outcome ? 'default' : 'pointer', opacity: pending || !outcome ? 0.5 : 1,
            }}
          >
            Apply outcome
          </button>
        </div>
      </div>

      {err && <div style={{ marginTop: 10, fontSize: 12.5, color: 'oklch(0.84 0.10 25)' }}>{err}</div>}
      {done && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--green-ink)' }}>{done}</div>}
    </div>
  );
}
