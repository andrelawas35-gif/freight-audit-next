'use client';

import { useState, useEffect } from 'react';
import { Card, KPI, Ticker, SectionLabel, Btn, RuleTag, StagePill } from '@/components/ui/primitives';
import { fmtDate, fmtPct, fmtUSD } from '@/lib/format';
import type { ClientScorecard } from '@/app/clients/page';

export function ClientsView({ 
  scorecards, 
  totals,
  disputes = [],
}: { 
  scorecards: ClientScorecard[], 
  totals: { recoveredMTD: number, recoveredYTD: number, gainShare: number },
  disputes?: any[],
}) {
  const [sel, setSel] = useState<ClientScorecard | null>(null);



  // Filter disputes for selected client
  const clientDisputes = sel
    ? disputes.filter(d => {
        const clientLink = d['Client'];
        if (Array.isArray(clientLink)) return clientLink.includes(sel.id);
        return false;
      })
    : [];
  const clientWon = clientDisputes.filter(d => d['Status'] === 'Won');
  const clientOpen = clientDisputes.filter(d => !['Won', 'Closed'].includes(d['Status'] || ''));

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
          label="Gain-share earned" accentBar="var(--amber)"
          value={fmtUSD(totals.gainShare)}
          sub="All time revenue generated"
        />
        <KPI 
          label="Recovered YTD" tone="ink" 
          value={fmtUSD(totals.recoveredYTD)}
          sub="This calendar year"
        />
      </div>

      {/* ── Full-width table OR detail view ─────────────── */}
      {sel ? (
        /* ── Client Statement (detail) ──────────────────── */
        <div>
          <div style={{ marginBottom: 14 }}>
            <Btn variant="ghost" size="sm" onClick={() => setSel(null)} style={{ color: 'var(--ink-3)', paddingLeft: 0 }}>
              <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M15 6l-6 6 6 6"/></svg>
              All clients
            </Btn>
          </div>

          {/* Hero recovery card */}
          <Card pad={0} style={{ overflow: 'hidden', marginBottom: 18 }}>
            <div style={{
              padding: '22px 24px',
              background: 'linear-gradient(135deg, var(--green-soft), transparent 80%)',
              borderBottom: '1px solid var(--line)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>Recovery statement · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 3, letterSpacing: '-0.01em' }}>{sel.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Net to you this month</div>
                  <div className="mono tnum" style={{ fontSize: 30, fontWeight: 700, color: 'var(--green-ink)', marginTop: 2 }}>
                    {fmtUSD(sel.recoveredMTD - (sel.recoveredMTD * sel.gainSharePct / 100))}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {[
                { k: 'Recovered MTD', v: fmtUSD(sel.recoveredMTD), tone: 'var(--green-ink)' },
                { k: `Gain-share (${sel.gainSharePct}%)`, v: '−' + fmtUSD(sel.recoveredMTD * sel.gainSharePct / 100), tone: 'var(--ink-2)' },
                { k: 'In dispute', v: fmtUSD(sel.openDisputed), tone: 'var(--amber-ink)' },
                { k: 'Recovered YTD', v: fmtUSD(sel.recoveredYTD), tone: 'var(--ink)' },
              ].map((s, i) => (
                <div key={i} style={{ padding: '15px 18px', borderRight: i < 3 ? '1px solid var(--line-2)' : 'none' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 6 }}>{s.k}</div>
                  <div className="mono tnum" style={{ fontSize: 18, fontWeight: 700, color: s.tone }}>{s.v}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Two side-by-side cards: won disputes + open disputes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Card>
              <SectionLabel right={<span className="mono" style={{ fontSize: 11, color: 'var(--green-ink)' }}>{clientWon.length} won</span>}>Recently recovered</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {clientWon.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5 }}>No wins yet this period.</div>}
                {clientWon.slice(0, 5).map((d, i) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderTop: i ? '1px solid var(--line-2)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{d['Dispute ID'] || d.id.slice(0, 10)}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{fmtDate(d['Date resolved'])}</div>
                    </div>
                    <span className="mono tnum" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--green-ink)' }}>{fmtUSD(d['Recovery amount'] || 0, true)}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <SectionLabel right={<span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{clientOpen.length} active</span>}>Working on your behalf</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {clientOpen.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5 }}>Nothing open right now.</div>}
                {clientOpen.slice(0, 5).map((d, i) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderTop: i ? '1px solid var(--line-2)' : 'none' }}>
                    <StagePill stage={d['Status'] || 'Open'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{d['Dispute ID'] || d.id.slice(0, 10)}</div>
                    </div>
                    <span className="mono tnum" style={{ fontSize: 13, fontWeight: 600 }}>{fmtUSD(d['Disputed amount'] || 0, true)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        /* ── Client Portfolio table ─────────────────────── */
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr 90px',
            gap: 14, padding: '11px 20px', background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line)',
          }}>
            {['Client', 'Recovered MTD', 'In dispute', 'Gain-share', 'Win rate', ''].map((h, i) => (
              <span key={i} style={{
                fontSize: 10.5, fontWeight: 600, color: 'var(--ink-faint)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                textAlign: i === 0 || i === 5 ? 'left' : 'right',
              }}>{h}</span>
            ))}
          </div>
          {scorecards.map((c, i) => {
            const fee = c.recoveredMTD * c.gainSharePct / 100;
            return (
              <button key={c.id} onClick={() => setSel(c)} style={{
                display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr 90px',
                gap: 14, alignItems: 'center', width: '100%', textAlign: 'left',
                border: 'none', borderTop: i ? '1px solid var(--line-2)' : 'none',
                padding: '14px 20px', background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', color: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
                    color: 'var(--canvas)',
                    background: `oklch(0.55 0.1 ${[152, 70, 244, 32, 295][i % 5]})`,
                  }}>{c.name[0]}</span>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{c.invoiceCount?.toLocaleString() || '—'} invoices audited</div>
                  </div>
                </div>
                <span className="mono tnum" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--green-ink)', textAlign: 'right' }}>{fmtUSD(c.recoveredMTD)}</span>
                <span className="mono tnum" style={{ fontSize: 13, color: 'var(--amber-ink)', textAlign: 'right' }}>{fmtUSD(c.openDisputed)}</span>
                <span className="mono tnum" style={{ fontSize: 13, color: 'var(--ink-2)', textAlign: 'right' }}>{fmtUSD(fee)} <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>·{c.gainSharePct}%</span></span>
                <div style={{ textAlign: 'right' }}>
                  <span className="mono tnum" style={{ fontSize: 13, fontWeight: 600 }}>{c.disputeCount > 0 ? fmtPct(c.winRate) : '—'}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: 'var(--ink-faint)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M9 6l6 6-6 6"/></svg>
                </div>
              </button>
            );
          })}
          {scorecards.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>
              No clients found. Add your first client in Airtable.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}