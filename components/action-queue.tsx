
/*
  components/action-queue.tsx — three-section action queue.

  DS reference: ui_kits/console/screen_dashboard.jsx
  Layout:
    Section 1 — "Filing within 48 hours" (hot accent, blinking dot)
    Section 2 — "Flagged audits · awaiting review" (amber accent, flag icon)
    Section 3 — "Carrier hasn't responded · 7+ days" (blue accent, clock icon)

  Data is passed in as props from the server component (app/page.tsx).
*/

'use client';

import { fmtUSD, fmtDate, daysUntil, daysAgo } from '@/lib/format';
import {
  Card, Btn, RuleTag, CarrierMark, StagePill, DeadlineChip,
  Checkbox, Glyph,
} from '@/components/ui/primitives';

// ── Normalize rule from notes (until Rule name field is reliable) ──
function guessRule(notes: string): string {
  if (!notes) return 'OTHER';
  const n = notes.toLowerCase();
  if (n.includes('dim') || n.includes('divisor') || n.includes('vol'))  return 'DIM_WEIGHT_TRAP';
  if (n.includes('residential') || n.includes('surcharge'))             return 'PHANTOM_ACCESSORIAL';
  if (n.includes('duplicate'))                                          return 'DUPLICATE_TRACKING';
  if (n.includes('business day') || n.includes('ltl'))                  return 'LTL_SLA_FAILURE';
  if (n.includes('guarantee') || n.includes('sla') || n.includes('late')) return 'SLA_FAILURE';
  return 'OTHER';
}

// ── ActionSection — reusable gradient-header card ────────────────
function ActionSection({ icon, title, blurb, accent, count, totalAmt, items, render, empty }: {
  icon: React.ReactNode;
  title: string;
  blurb: string;
  accent: string;
  count: number;
  totalAmt: number;
  items: any[];
  render: (item: any, i: number) => React.ReactNode;
  empty: string;
}) {
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 11,
        background: `linear-gradient(180deg, ${accent}, transparent 220%)`,
      }}>
        {icon}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.005em' }}>{title}</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1 }}>{blurb}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="mono tnum" style={{ fontSize: 13.5, fontWeight: 700 }}>{count}</div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>items</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono tnum" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--green-ink)' }}>{fmtUSD(totalAmt)}</div>
            <div style={{ fontSize: 9.5, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>exposure</div>
          </div>
        </div>
      </div>
      <div>
        {items.length === 0
          ? <div style={{ padding: 22, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>{empty}</div>
          : items.map(render)
        }
      </div>
      {items.length > 0 && items.length < count && (
        <div style={{ padding: '7px 14px', borderTop: '1px solid var(--line)' }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', letterSpacing: '0.03em' }}>
            Showing {items.length} of {count.toLocaleString()} items
          </span>
        </div>
      )}
    </Card>
  );
}

// ── Main export ──────────────────────────────────────────────────
export function ActionQueue({ auditResults, disputes }: {
  auditResults: any[];
  disputes: any[];
}) {
  // ── Compute recoverable amount per audit result ───────────
  const enriched = auditResults.map(a => {
    const billed   = a['Billed amount'] || 0;
    const expected = a['Expected amount'] || 0;
    const recover  = a['Recover amount'] || a['Recoverable amount'] || Math.max(0, billed - expected);
    const rule     = a['Rule name'] || guessRule(a['Notes'] || '');
    const carrier  = a['Carrier SCAC'] || a['Carrier (display)'] || '';
    const deadline = a['Filing deadline'] || null;
    const hasDispute = a['Disputes'] && a['Disputes'].length > 0;
    return { ...a, recover, rule, carrier, deadline, hasDispute };
  });

  // ── Enrich disputes with silent days ──────────────────────
  const enrichedDisputes = disputes.map(d => {
    const filed = d['Filed date'];
    const resolved = d['Date resolved'];
    const silentDays = filed && !resolved ? daysAgo(filed) || 0 : 0;
    const carrier = d['Carrier'] || d['Carrier (display)'] || '';
    return { ...d, silentDays, carrier };
  });

  // ── Section 1: Filing within 48 hours (deadline ≤ 5 days) ─
  const fileSoon = enriched
    .filter(a => a.deadline && !a.hasDispute)
    .map(a => ({ a, n: daysUntil(a.deadline) }))
    .filter(x => x.n !== null && x.n >= -1 && x.n <= 5)
    .sort((a, b) => (a.n ?? 99) - (b.n ?? 99));

  // ── Section 2: Flagged awaiting review (no urgent deadline) ─
  const flagged = enriched
    .filter(a => !a.hasDispute && (!a.deadline || (daysUntil(a.deadline) ?? 99) > 5))
    .sort((a, b) => b.recover - a.recover);

  // ── Section 3: Silent disputes (7+ days no response) ──────
  const silent = enrichedDisputes
    .filter(d => d.silentDays >= 7 && !['Won', 'Closed'].includes(d['Status'] || ''))
    .sort((a, b) => b.silentDays - a.silentDays);

  const sumFileSoon = fileSoon.reduce((s, x) => s + x.a.recover, 0);
  const sumFlagged  = flagged.reduce((s, a) => s + a.recover, 0);
  const sumSilent   = silent.reduce((s, d) => s + (d['Disputed amount'] || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Section 1: Filing within 48 hours ────────────── */}
      <ActionSection
        title="Filing within 48 hours"
        blurb="Refundable cases approaching the carrier filing window. Miss it and 100% of the recovery is lost."
        accent="var(--hot-soft)"
        count={fileSoon.length}
        totalAmt={sumFileSoon}
        items={fileSoon}
        empty="Nothing in the danger zone. Nicely cleared."
        icon={
          <span style={{
            width: 24, height: 24, borderRadius: 6, background: 'var(--hot-soft)',
            border: '1px solid var(--hot-line)', display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 9, background: 'var(--hot)',
              animation: 'faBlink 1.1s steps(1) infinite',
            }} />
          </span>
        }
        render={({ a, n }, i) => (
          <div key={a.id} style={{
            display: 'grid', gridTemplateColumns: '64px 1fr 90px 90px 80px',
            gap: 12, alignItems: 'center', padding: '0 12px', height: 32,
            borderBottom: '1px solid var(--line-2)', transition: 'background 0.06s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <DeadlineChip iso={a.deadline} />
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <RuleTag rule={a.rule} />
              <span style={{
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{a['Notes']?.slice(0, 60) || '—'}</span>
            </div>
            {a.carrier ? <CarrierMark scac={a.carrier} withName /> : <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>—</span>}
            <span className="mono tnum" style={{
              textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--green-ink)',
            }}>{fmtUSD(a.recover, true)}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn variant={n <= 1 ? 'amber' : 'default'} size="sm">File</Btn>
            </div>
          </div>
        )}
      />

      {/* ── Section 2: Flagged audits awaiting review ─────── */}
      <ActionSection
        title="Flagged audits · awaiting review"
        blurb="Today's batch from the last audit run. Sorted by dollar value."
        accent="var(--amber-soft)"
        count={flagged.length}
        totalAmt={sumFlagged}
        items={flagged.slice(0, 8)}
        empty="Queue is empty."
        icon={
          <span style={{
            width: 24, height: 24, borderRadius: 6, background: 'var(--amber-soft)',
            border: '1px solid var(--amber-line)', display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" style={{
              width: 13, height: 13, fill: 'none', stroke: 'var(--amber-ink)',
              strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
            }}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
          </span>
        }
        render={(a, i) => (
          <div key={a.id} style={{
            display: 'grid', gridTemplateColumns: '54px 1fr 90px 90px 80px',
            gap: 12, alignItems: 'center', padding: '0 12px', height: 32,
            borderBottom: '1px solid var(--line-2)', transition: 'background 0.06s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <RuleTag rule={a.rule} />
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{a['Notes']?.slice(0, 60) || '—'}</span>
              <span className="mono" style={{
                fontSize: 10.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{fmtDate(a['Audited at'])}</span>
            </div>
            {a.carrier ? <CarrierMark scac={a.carrier} withName /> : <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>—</span>}
            <span className="mono tnum" style={{
              textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--green-ink)',
            }}>{fmtUSD(a.recover, true)}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn variant="default" size="sm">File</Btn>
            </div>
          </div>
        )}
      />

      {/* ── Section 3: Carrier hasn't responded · 7+ days ── */}
      <ActionSection
        title="Carrier hasn't responded · 7+ days"
        blurb="Filed disputes with no carrier reply. Time to follow up or escalate."
        accent="var(--blue-soft)"
        count={silent.length}
        totalAmt={sumSilent}
        items={silent}
        empty="No stale disputes — all carriers are responsive right now."
        icon={
          <span style={{
            width: 24, height: 24, borderRadius: 6, background: 'var(--blue-soft)',
            border: '1px solid var(--blue-line)', display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" style={{
              width: 13, height: 13, fill: 'none', stroke: 'var(--blue-ink)',
              strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
            }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </span>
        }
        render={(d, i) => (
          <div key={d.id} style={{
            display: 'grid', gridTemplateColumns: '70px 1fr 90px 60px 90px 80px',
            gap: 12, alignItems: 'center', padding: '0 12px', height: 32,
            borderBottom: '1px solid var(--line-2)', transition: 'background 0.06s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <span className="mono tnum" style={{
              fontSize: 10.5, fontWeight: 700, color: 'var(--amber-ink)',
              background: 'var(--amber-soft)', border: '1px solid var(--amber-line)',
              padding: '1px 6px', borderRadius: 3, textAlign: 'center', lineHeight: 1.5,
            }}>{d.silentDays}d silent</span>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{d['Dispute ID'] || d.id.slice(0, 10)}</span>
              <span className="mono" style={{
                fontSize: 10.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{d['Resolution notes']?.slice(0, 40) || '—'}</span>
            </div>
            {d.carrier ? <CarrierMark scac={d.carrier} withName /> : <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>—</span>}
            <StagePill stage={d['Status'] || 'Open'} />
            <span className="mono tnum" style={{
              textAlign: 'right', fontSize: 13, fontWeight: 700,
            }}>{fmtUSD(d['Disputed amount'] || 0, true)}</span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn variant="default" size="sm">Follow up</Btn>
            </div>
          </div>
        )}
      />
    </div>
  );
}


function StatusBadge({ status }: { status?: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    'Open':       { bg: 'var(--amber-soft)', color: 'var(--amber-ink)' },
    'In review':  { bg: 'var(--blue-soft)',  color: 'var(--blue-ink)' },
    'Submitted':  { bg: 'var(--violet-soft)', color: 'var(--violet-ink)' },
    'Escalated':  { bg: 'var(--hot-soft)',   color: 'var(--hot-ink)' },
    'Won':        { bg: 'var(--green-soft)', color: 'var(--green-ink)' },
    'Closed':     { bg: 'var(--surface-sunk)', color: 'var(--ink-3)' },
  };

  const c = colors[status || ''] || colors['Open'];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      background: c.bg, color: c.color,
    }}>
      {status || 'Open'}
    </span>
  );
}

