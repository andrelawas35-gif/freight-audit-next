'use client';

import { useState, useTransition } from 'react';
import {
  resolveExceptionAction, dismissExceptionAction, suggestExceptionAction,
} from '@/app/(console)/ingestion/exceptions/actions';

type ExceptionRow = {
  id: string; mapping_type: string; carrier_scac: string | null; raw_code: string;
  source: string | null; suggested_code: string | null; suggested_confidence: number | null;
  reasoning: string | null; occurrences: number; created_at: string;
};

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-sunk)', border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 12, color: 'var(--ink)',
};

export function ExceptionsQueue({ rows, accessorials, clerkEnabled }: {
  rows: ExceptionRow[]; accessorials: string[]; clerkEnabled: boolean;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Type</th><th>Carrier</th><th>Unknown code</th><th className="num">Seen</th>
            <th>Map to standard code</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <Row key={r.id} row={r} accessorials={accessorials} clerkEnabled={clerkEnabled} />)}
          {rows.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 28 }}>
              No open exceptions. Ingestion is fully mapped. 🎉
            </td></tr>
          )}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div style={{ padding: '7px 14px', borderTop: '1px solid var(--line)' }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.03em' }}>
            {rows.length} open exception{rows.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

function ConfidencePill({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'var(--green-ink)' : pct >= 50 ? 'var(--amber-ink)' : 'var(--ink-3)';
  const bg = pct >= 80 ? 'var(--green-soft)' : pct >= 50 ? 'var(--amber-soft)' : 'var(--surface-sunk)';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 'var(--radius-pill)', padding: '1px 7px' }}>
      AI {pct}%
    </span>
  );
}

function Row({ row, accessorials, clerkEnabled }: { row: ExceptionRow; accessorials: string[]; clerkEnabled: boolean }) {
  const isAccessorial = row.mapping_type === 'accessorial';
  const [val, setVal] = useState(row.suggested_code || '');
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const resolve = () => start(async () => {
    setErr(null);
    const res = await resolveExceptionAction(row.id, val);
    if (res && !res.ok) setErr(res.error || 'Error');
  });
  const dismiss = () => start(async () => { await dismissExceptionAction(row.id); });
  const suggest = () => start(async () => {
    setErr(null);
    const res = await suggestExceptionAction(row.id);
    if (res?.ok && 'standardCode' in res) setVal(res.standardCode as string);
    else if (res && !res.ok) setErr(res.error || 'Error');
  });

  return (
    <tr style={{ opacity: pending ? 0.6 : 1 }}>
      <td><span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{isAccessorial ? 'Accessorial' : 'Service level'}</span></td>
      <td className="mono" style={{ fontSize: 11.5 }}>{row.carrier_scac || '—'}</td>
      <td><code style={{ background: 'var(--surface-sunk)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 7px', fontSize: 12 }}>{row.raw_code}</code></td>
      <td className="num mono">{row.occurrences}</td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {isAccessorial ? (
            <select value={val} onChange={(e) => setVal(e.target.value)} style={{ ...inputStyle, minWidth: 190 }}>
              <option value="">— select —</option>
              {accessorials.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          ) : (
            <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="e.g. Ground" style={{ ...inputStyle, minWidth: 160 }} />
          )}
          {row.suggested_confidence != null && <ConfidencePill pct={row.suggested_confidence} />}
        </div>
        {row.reasoning && (
          <div style={{ fontSize: 10.5, color: 'var(--ink-faint)', marginTop: 4, maxWidth: 320 }}>
            💡 {row.reasoning}
          </div>
        )}
        {err && <div style={{ fontSize: 11, color: 'oklch(0.84 0.10 25)', marginTop: 3 }}>{err}</div>}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={resolve} disabled={pending || !val} style={btn('var(--green-ink)', !val)}>Save mapping</button>
          {clerkEnabled && <button onClick={suggest} disabled={pending} style={btn('var(--blue-ink)')}>AI suggest</button>}
          <button onClick={dismiss} disabled={pending} style={btn('var(--ink-3)')}>Dismiss</button>
        </div>
      </td>
    </tr>
  );
}

const btn = (color: string, disabled = false): React.CSSProperties => ({
  background: 'transparent', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
  padding: '5px 10px', fontSize: 11.5, color, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
});
