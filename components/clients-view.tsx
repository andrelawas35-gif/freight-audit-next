'use client';

import { useState, useEffect } from 'react';
import { fmtUSD, fmtPct } from '@/lib/format';
import { Card, KPI, Ticker, SectionLabel } from '@/components/ui/primitives';
import type { ClientScorecard } from '@/app/clients/page';

export function ClientsView({ 
  scorecards, 
  totals 
}: { 
  scorecards: ClientScorecard[], 
  totals: { recoveredMTD: number, recoveredYTD: number, gainShare: number } 
}) {
  const [sel, setSel] = useState<ClientScorecard | null>(null);

  // Auto-select the first client on load
  useEffect(() => {
    if (!sel && scorecards.length > 0) setSel(scorecards[0]);
  }, [scorecards, sel]);

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1340, margin: '0 auto' }}>
      
      {/* ── 3 KPI tiles ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <KPI 
          label="Portfolio recovered MTD" tone="green" accentBar="var(--green)"
          value={fmtUSD(totals.recoveredMTD)}
          sub="This month across active contracts"
        />
        <KPI 
          label="Gain-share earned" tone="blue" accentBar="var(--blue)"
          value={fmtUSD(totals.gainShare)}
          sub="All time revenue generated"
        />
        <KPI 
          label="Recovered YTD" tone="ink" 
          value={fmtUSD(totals.recoveredYTD)}
          sub="This calendar year"
        />
      </div>

      {/* ── Two-Pane Layout ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        
        {/* LIST PANE */}
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Client Portfolio</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="num">Gain share</th>
                  <th className="num">Win rate</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scorecards.map(c => (
                  <tr 
                    key={c.id} 
                    onClick={() => setSel(c)} 
                    style={{ 
                      cursor: 'pointer', 
                      background: sel?.id === c.id ? 'var(--row-active)' : 'transparent',
                      boxShadow: sel?.id === c.id ? 'inset 2px 0 0 var(--blue)' : 'none',
                    }}
                  >
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="num mono">{c.gainSharePct > 0 ? `${c.gainSharePct}%` : '—'}</td>
                    <td className="num mono" style={{ 
                      color: c.winRate >= 0.80 ? 'var(--green-ink)' : 'var(--ink)' 
                    }}>
                      {c.disputeCount > 0 ? fmtPct(c.winRate) : '—'}
                    </td>
                    <td>
                      <span style={{
                        width: 8, height: 8, borderRadius: 4, display: 'inline-block',
                        background: c.active ? 'var(--green)' : 'var(--ink-faint)',
                        marginRight: 6
                      }} />
                      <span style={{ fontSize: 11, color: c.active ? 'var(--ink)' : 'var(--ink-faint)' }}>
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
                {scorecards.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: 30 }}>
                      No clients found. Add your first client in Airtable.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* DETAIL PANE (Client Statement) */}
        {sel ? (
          <Card pad={0}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{sel.name}</h2>
                <span style={{ 
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: sel.active ? 'var(--green-ink)' : 'var(--ink-faint)' 
                }}>
                  {sel.active ? 'Active Contract' : 'Inactive'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Client Statement</div>
            </div>
            
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>YTD Recovered</div>
                  <div className="mono tnum" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{fmtUSD(sel.recoveredYTD)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Gain-Share Earned</div>
                  <div className="mono tnum" style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue-ink)' }}>{fmtUSD(sel.gainShareEarned)}</div>
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--line)', margin: '0 -20px 20px -20px' }} />

              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Contract Terms & Activity</div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed var(--line-2)' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Gain Share Rate</span>
                  <span className="mono tnum" style={{ fontSize: 12.5, fontWeight: 600 }}>{sel.gainSharePct}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed var(--line-2)' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Min Invoice Threshold</span>
                  <span className="mono tnum" style={{ fontSize: 12.5, fontWeight: 600 }}>{fmtUSD(sel.threshold)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed var(--line-2)' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Total Disputes Filed</span>
                  <span className="mono tnum" style={{ fontSize: 12.5, fontWeight: 600 }}>{sel.disputeCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed var(--line-2)' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Last Audit Run</span>
                  <span className="mono tnum" style={{ fontSize: 12.5, fontWeight: 600 }}>{sel.lastAudit.slice(0, 10)}</span>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 300, color: 'var(--ink-faint)', fontSize: 12, background: 'var(--surface-sunk)', borderRadius: 12, border: '1px dashed var(--line)' }}>
            Select a client to view their statement
          </div>
        )}
      </div>
    </div>
  );
}