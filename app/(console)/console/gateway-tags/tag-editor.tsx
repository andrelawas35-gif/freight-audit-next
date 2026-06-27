'use client';

import { useState, useTransition } from 'react';
import { updateGatewayTag } from './actions';
import { fmtUSD } from '@/lib/format';

interface GatewayTagRow {
  id: string;
  client: string;
  carrier: string;
  rule: string;
  variance: number;
  preventability: string;
  category: string | null;
  ruleSuggestion: string | null;
  invoiceNumber: string | null;
  trackingNumber: string | null;
  auditedAt: string | null;
}

const PREVENT_OPTIONS = [
  { value: 'PREVENTABLE_BY_GATEWAY', label: 'Preventable', color: 'var(--amber-ink)', bg: 'rgba(245,158,11,0.1)' },
  { value: 'NON_PREVENTABLE_BY_GATEWAY', label: 'Non-Preventable', color: 'var(--green-ink)', bg: 'rgba(16,185,129,0.1)' },
  { value: 'UNKNOWN', label: 'Unknown', color: 'var(--ink-3)', bg: 'rgba(156,163,175,0.1)' },
] as const;

type FilterMode = 'ALL' | 'PREVENTABLE_BY_GATEWAY' | 'NON_PREVENTABLE_BY_GATEWAY' | 'UNKNOWN';

export function GatewayTagEditor({ rows: initialRows }: { rows: GatewayTagRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<FilterMode>('ALL');
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; ok: boolean }>>([]);

  function toast(text: string, ok: boolean) {
    const t = { id: String(Date.now()), text, ok };
    setToasts(prev => [...prev, t]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 2500);
  }

  function handleTagChange(rowId: string, newPreventability: string) {
    startTransition(async () => {
      const result = await updateGatewayTag(rowId, newPreventability as any);
      if (result.ok) {
        setRows(prev => prev.map(r =>
          r.id === rowId ? { ...r, preventability: newPreventability } : r
        ));
        toast(`Updated to ${PREVENT_OPTIONS.find(o => o.value === newPreventability)?.label}`, true);
      } else {
        toast(result.error ?? 'Update failed', false);
      }
    });
  }

  const filtered = filter === 'ALL' ? rows : rows.filter(r => r.preventability === filter);

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Toasts ───────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 72, right: 20, zIndex: 100,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '6px 14px', borderRadius: 6, fontSize: 12.5,
            background: t.ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            color: t.ok ? 'var(--green-ink)' : 'var(--red-ink)',
            fontWeight: 500, border: `1px solid ${t.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>{t.text}</div>
        ))}
      </div>

      {/* ── Filter Chips ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {([{ v: 'ALL', l: 'All' }, ...PREVENT_OPTIONS.map(o => ({ v: o.value, l: o.label }))] as const).map(f => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v as FilterMode)}
            style={{
              padding: '4px 12px', borderRadius: 14, border: '1px solid var(--line)',
              fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
              background: filter === f.v ? 'var(--surface-sunk)' : 'transparent',
              color: filter === f.v ? 'var(--ink-1)' : 'var(--ink-3)',
            }}
          >
            {f.l}
          </button>
        ))}
      </div>

      {/* ── Table ─────────────────────────────────── */}
      <div style={{
        borderRadius: 8, border: '1px solid var(--line)', overflow: 'hidden',
        fontSize: 12.5, background: 'var(--surface)',
      }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr 0.8fr 0.7fr 1fr 120px',
          gap: 0, padding: '8px 14px', borderBottom: '1px solid var(--line)',
          background: 'var(--surface-sunk)', fontWeight: 600, fontSize: 11,
          textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)',
        }}>
          <div>Client</div>
          <div>Carrier / Rule</div>
          <div>Variance</div>
          <div>Invoice</div>
          <div>Gateway Tag</div>
          <div style={{ textAlign: 'right' }}>Action</div>
        </div>

        {/* Rows */}
        {filtered.map(row => {
          const opt = PREVENT_OPTIONS.find(o => o.value === row.preventability);
          return (
            <div key={row.id} style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr 0.8fr 0.7fr 1fr 120px',
              gap: 0, padding: '8px 14px', borderBottom: '1px solid var(--line)',
              alignItems: 'center', fontSize: 12,
            }}>
              {/* Client */}
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.client}
              </div>

              {/* Carrier / Rule */}
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.carrier}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.rule}
                </div>
              </div>

              {/* Variance */}
              <div style={{
                fontWeight: 600,
                color: row.variance < 0 ? 'var(--red-ink)' : row.variance > 0 ? 'var(--green-ink)' : 'var(--ink-3)',
              }}>
                {fmtUSD(row.variance, true)}
              </div>

              {/* Invoice */}
              <div style={{
                fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--ink-3)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {row.invoiceNumber || row.trackingNumber || '—'}
              </div>

              {/* Gateway Tag */}
              <div>
                <select
                  value={row.preventability}
                  onChange={e => handleTagChange(row.id, e.target.value)}
                  disabled={pending}
                  style={{
                    padding: '3px 8px', borderRadius: 4, border: '1px solid var(--line)',
                    fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                    background: opt?.bg ?? 'transparent',
                    color: opt?.color ?? 'var(--ink-3)',
                    maxWidth: 150,
                  }}
                >
                  {PREVENT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {row.category && row.category !== 'confirmed' && (
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                    {row.category}
                  </div>
                )}
                {row.category === 'confirmed' && (
                  <div style={{ fontSize: 10, color: 'var(--green-ink)', marginTop: 2 }}>
                    ✓ confirmed
                  </div>
                )}
              </div>

              {/* Action */}
              <div style={{ textAlign: 'right' }}>
                <button
                  onClick={() => setEditing(editing === row.id ? null : row.id)}
                  style={{
                    padding: '3px 10px', borderRadius: 4, border: '1px solid var(--line)',
                    background: 'transparent', cursor: 'pointer', fontSize: 11,
                    color: 'var(--ink-2)',
                  }}
                >
                  {editing === row.id ? 'Close' : 'Details'}
                </button>
              </div>

              {/* Expanded Details Row */}
              {editing === row.id && (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '10px 0', borderTop: '1px solid var(--line)',
                  marginTop: 4,
                }}>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11.5 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--ink-3)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.04em' }}>
                        Rule Suggestion
                      </div>
                      <div style={{
                        padding: 8, borderRadius: 4, background: 'var(--surface-sunk)',
                        minHeight: 36, color: row.ruleSuggestion ? 'var(--ink-1)' : 'var(--ink-3)',
                        fontSize: 11.5, lineHeight: 1.5,
                      }}>
                        {row.ruleSuggestion || 'No gateway rule suggestion generated.'}
                      </div>
                    </div>
                    <div style={{ minWidth: 140 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--ink-3)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.04em' }}>
                        Metadata
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                        <div>ID: <code style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>{row.id.slice(0, 12)}…</code></div>
                        <div>Invoice: {row.invoiceNumber || '—'}</div>
                        <div>Tracking: {row.trackingNumber || '—'}</div>
                        <div>Audited: {row.auditedAt || '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
            No audit results match this filter.
          </div>
        )}
      </div>
    </div>
  );
}
