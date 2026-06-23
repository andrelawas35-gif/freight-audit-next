/*
  components/disputes-view.tsx — Disputes pipeline, two-pane UI.

  Converted from screen_disputes.jsx. Behavior preserved:
    - Filter by Stage / Carrier / Rule
    - Group by stage (in pipeline order) / carrier / rule / none
    - Sort by newest / $ amount / silent days
    - j/k keyboard navigation
    - Detail pane: claim amount or recovered amount, audit trail
      timeline derived from date fields, "Advance stage" action,
      "Add note" and "Mark carrier responded" for silent disputes.

  Data comes from app/disputes/page.tsx. Writes go through
  app/disputes/actions.ts (advanceStage, addDisputeNote, markCarrierResponded).
*/

'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { fmtUSD, fmtDate, fmtDateFull, STAGES } from '@/lib/format';
import {
  RuleTag, ruleName, StagePill, DeadlineChip, CarrierMark,
  Btn, Glyph, Segmented, FilterChip, FilterPopover, AuditTrail,
  type TrailEvent,
} from '@/components/ui/primitives';
import { advanceStage, addDisputeNote, markCarrierResponded } from '@/app/(console)/disputes/actions';

export type DisputeRow = {
  id: string;
  displayId: string;
  client: string;
  invoice: string;
  pro: string;
  carrier: string;
  rule: string;
  stage: string;
  amount: number;
  recovery: number;
  opened: string;
  filed: string | null;
  resolved: string | null;
  deadline: string | null;
  silentDays: number;
  owner: string;
  events: TrailEvent[];
  notes: string;
};

export function DisputesView({ initialRows, loadError }: { initialRows: DisputeRow[]; loadError: string | null }) {
  const [rows, setRows] = useState(initialRows);
  const [stages, setStages] = useState<string[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [rules, setRules] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState('stage');
  const [sort, setSort] = useState('opened');
  const [sel, setSel] = useState<DisputeRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setRows(initialRows); }, [initialRows]);

  // ── filter ──────────────────────────────────────────────────
  let filtered = rows.filter(d => {
    if (stages.length && !stages.includes(d.stage)) return false;
    if (carriers.length && !carriers.includes(d.carrier)) return false;
    if (rules.length && !rules.includes(d.rule)) return false;
    return true;
  });

  // ── sort ────────────────────────────────────────────────────
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'amount') return b.amount - a.amount;
    if (sort === 'silent') return (b.silentDays || 0) - (a.silentDays || 0);
    return new Date(b.opened).getTime() - new Date(a.opened).getTime();
  });

  // ── group ───────────────────────────────────────────────────
  type Group = { key: string; label: string | null; items: DisputeRow[] };
  let grouped: Group[] = [];
  if (groupBy === 'none') {
    grouped = [{ key: 'all', label: null, items: filtered }];
  } else {
    const keyer: Record<string, (d: DisputeRow) => string> = {
      stage: (d) => d.stage, carrier: (d) => d.carrier, rule: (d) => d.rule,
    };
    const labeler: Record<string, (k: string) => string> = {
      stage: (k) => k, carrier: (k) => k, rule: (k) => ruleName(k),
    };
    const order = groupBy === 'stage' ? STAGES : null;
    const buckets: Record<string, DisputeRow[]> = {};
    filtered.forEach(d => { const k = keyer[groupBy](d); (buckets[k] = buckets[k] || []).push(d); });
    const keys = order ? order.filter(k => buckets[k]) : Object.keys(buckets);
    grouped = keys.map(k => ({ key: k, label: labeler[groupBy](k), items: buckets[k] }));
  }
  const flat = grouped.flatMap(g => g.items);

  // ── selection + keyboard nav ───────────────────────────────
  useEffect(() => { if (!sel && flat.length) setSel(flat[0]); }, [flat, sel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey) return;
      const i = flat.findIndex(d => d.id === sel?.id);
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); if (i < flat.length - 1) setSel(flat[i + 1]); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) setSel(flat[i - 1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, sel]);

  useEffect(() => {
    if (!sel || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-rid="${sel.id}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  // ── write actions ───────────────────────────────────────────
  const handleAdvance = (d: DisputeRow) => {
    const idx = STAGES.indexOf(d.stage);
    if (idx === -1 || idx >= STAGES.length - 1) return;
    const next = STAGES[idx + 1];
    const today = new Date().toISOString().slice(0, 10);

    setRows(prev => prev.map(r => {
      if (r.id !== d.id) return r;
      const updated: DisputeRow = { ...r, stage: next };
      if (next === 'Submitted') updated.filed = today;
      if (next === 'Won' || next === 'Closed') {
        updated.resolved = today;
        if (next === 'Won' && !updated.recovery) updated.recovery = updated.amount;
      }
      updated.events = [...r.events, eventForStage(next, today)];
      return updated;
    }));
    if (sel?.id === d.id) setSel(prev => prev ? { ...prev, stage: next } : prev);

    startTransition(() => { advanceStage(d.id); });
  };

  const handleMarkResponded = (d: DisputeRow) => {
    setRows(prev => prev.map(r => r.id === d.id ? { ...r, silentDays: 0 } : r));
    startTransition(() => { markCarrierResponded(d.id); });
  };

  // NEW: Handle Adding Notes optimistically
  const handleAddNote = (d: DisputeRow, noteText: string) => {
    const today = new Date().toISOString().slice(0, 10);
    
    setRows(prev => prev.map(r => {
      if (r.id !== d.id) return r;
      // Append to notes string and add to audit trail instantly
      return { 
        ...r, 
        notes: r.notes ? `${r.notes}\n\n${noteText}` : noteText,
        events: [...r.events, { kind: 'escalated', date: today, actor: 'Team', note: noteText }] // Using 'escalated' or similar generic kind for notes
      };
    }));
    
    if (sel?.id === d.id) {
        setSel(prev => prev ? { 
            ...prev, 
            notes: prev.notes ? `${prev.notes}\n\n${noteText}` : noteText,
            events: [...prev.events, { kind: 'escalated', date: today, actor: 'Team', note: noteText }]
        } : prev);
    }

    startTransition(() => { addDisputeNote(d.id, noteText); });
  };

  // ── filter helpers ──────────────────────────────────────────
  const toggleArr = (arr: string[], setter: (v: string[]) => void) => (v: string) =>
    setter(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const carrierOptions = [...new Set(rows.map(r => r.carrier))].map(c => ({ value: c, label: c }));
  const ruleOptions    = [...new Set(rows.map(r => r.rule))].map(r => ({ value: r, label: ruleName(r).slice(0, 14) }));

  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Couldn't load disputes</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--hot-ink)' }}>{loadError}</div>
        <div style={{ fontSize: 12, marginTop: 12 }}>Check your AIRTABLE_PAT and AIRTABLE_BASE_ID in .env.local</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No disputes yet</div>
        <div style={{ fontSize: 12.5 }}>Disputes appear here once filed from the Audit Queue.</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Filter & control bar */}
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid var(--line)', background: 'var(--surface-sunk)',
        display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
      }}>
        <FilterPopover label="Stage" options={STAGES.map(s => ({ value: s, label: s }))} selected={stages} onToggle={toggleArr(stages, setStages)} />
        <FilterPopover label="Carrier" options={carrierOptions} selected={carriers} onToggle={toggleArr(carriers, setCarriers)} />
        <FilterPopover label="Rule" options={ruleOptions} selected={rules} onToggle={toggleArr(rules, setRules)} />
        <span style={{ width: 1, height: 18, background: 'var(--line)', marginInline: 3 }} />
        <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Group</span>
        <Segmented value={groupBy} onChange={setGroupBy} options={[
          { value: 'stage', label: 'Stage' }, { value: 'carrier', label: 'Carrier' }, { value: 'rule', label: 'Rule' }, { value: 'none', label: 'None' },
        ]} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sort</span>
        <Segmented value={sort} onChange={setSort} options={[
          { value: 'opened', label: 'Newest' }, { value: 'amount', label: '$ Amount' }, { value: 'silent', label: 'Silent' },
        ]} />
        <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
          {filtered.length !== rows.length
            ? `${filtered.length} of ${rows.length}`
            : `${rows.length}`} disputes
        </span>
      </div>

      {/* Active filter chips */}
      {(stages.length + carriers.length + rules.length) > 0 && (
        <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--line)', background: 'var(--canvas)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 3 }}>Active</span>
          {stages.map(s => <FilterChip key={'s-' + s} onRemove={() => setStages(stages.filter(x => x !== s))}>Stage: {s}</FilterChip>)}
          {carriers.map(c => <FilterChip key={'c-' + c} onRemove={() => setCarriers(carriers.filter(x => x !== c))}>Carrier: {c}</FilterChip>)}
          {rules.map(r => <FilterChip key={'r-' + r} onRemove={() => setRules(rules.filter(x => x !== r))}>Rule: {ruleName(r)}</FilterChip>)}
        </div>
      )}

      {/* Two-pane layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', minHeight: 0 }}>

        {/* LIST */}
        <div ref={listRef} style={{ overflow: 'auto', borderRight: '1px solid var(--line)' }}>
          <div style={{
            position: 'sticky', top: 0, zIndex: 6, background: 'var(--surface-2)', borderBottom: '1px solid var(--line)',
            display: 'grid', gridTemplateColumns: '46px 1fr 64px 110px 60px 70px 80px', gap: 8,
            padding: '6px 10px', alignItems: 'center', fontSize: 10, color: 'var(--ink-faint)',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
          }}>
            <span>Opened</span>
            <span>Client / Invoice</span>
            <span>Rule</span>
            <span>Carrier</span>
            <span>Stage</span>
            <span>Silent</span>
            <span style={{ textAlign: 'right' }}>$ Amount</span>
          </div>

          {grouped.map(g => (
            <div key={g.key}>
              {g.label && (
                <div style={{
                  position: 'sticky', top: 26, zIndex: 5, background: 'var(--canvas)', padding: '5px 12px',
                  borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 9,
                }}>
                  {groupBy === 'stage'
                    ? <StagePill stage={g.key} full />
                    : <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g.label}</span>}
                  <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>
                    {g.items.length} · {fmtUSD(g.items.reduce((a, b) => a + (b.stage === 'Won' ? (b.recovery || 0) : b.amount), 0))}
                  </span>
                </div>
              )}
              {g.items.map(d => (
                <DisputeRowItem key={d.id} d={d} active={sel?.id === d.id} onClick={() => setSel(d)} />
              ))}
            </div>
          ))}

          {flat.length === 0 && <div style={{ padding: 38, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>No disputes match these filters.</div>}
        </div>

        {/* DETAIL */}
          <div style={{ overflow: 'hidden' }}>
            <DisputeDetail 
              d={sel} 
              onAdvance={handleAdvance} 
              onMarkResponded={handleMarkResponded} 
              onAddNote={handleAddNote} // <-- ADD THIS LINE
            />
          </div>
      </div>

      {isPending && (
        <div style={{
          position: 'absolute', top: 8, right: 8, fontSize: 10, color: 'var(--ink-faint)',
          padding: '2px 8px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10,
        }}>Saving…</div>
      )}
    </div>
  );
}

// ── Single row ────────────────────────────────────────────────
function DisputeRowItem({ d, active, onClick }: { d: DisputeRow; active: boolean; onClick: () => void }) {
  const isWon = d.stage === 'Won';
  return (
    <div data-rid={d.id} onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '46px 1fr 64px 110px 60px 70px 80px', gap: 8, alignItems: 'center',
      padding: '0 10px', height: 30, cursor: 'pointer',
      borderBottom: '1px solid var(--line-2)',
      background: active ? 'var(--row-active)' : 'transparent',
      boxShadow: active ? 'inset 2px 0 0 var(--amber)' : 'none',
    }}>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{fmtDate(d.opened)}</span>
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.client}</span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.displayId} · {d.invoice}</span>
      </div>
      <RuleTag rule={d.rule} />
      <CarrierMark scac={d.carrier} withName />
      <StagePill stage={d.stage} />
      <span className="mono tnum" style={{ fontSize: 10.5, color: d.silentDays >= 7 ? 'var(--amber-ink)' : 'var(--ink-3)', fontWeight: d.silentDays >= 7 ? 700 : 400 }}>
        {d.silentDays > 0 && !['Won', 'Closed'].includes(d.stage) ? d.silentDays + 'd' : '—'}
      </span>
      <span className="mono tnum" style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: isWon ? 'var(--green-ink)' : 'var(--ink)' }}>
        {fmtUSD(isWon ? (d.recovery || 0) : d.amount, true)}
      </span>
    </div>
  );
}

// ── Detail pane ───────────────────────────────────────────────
function DisputeDetail({ d, onAdvance, onMarkResponded, onAddNote }: {
  d: DisputeRow | null;
  onAdvance: (d: DisputeRow) => void;
  onMarkResponded: (d: DisputeRow) => void;
  onAddNote: (d: DisputeRow, note: string) => void;

  
}) {

  const [noteInput, setNoteInput] = useState('');

  if (!d) return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ display: 'inline-grid', placeItems: 'center', width: 36, height: 36, borderRadius: 9, background: 'var(--surface-sunk)', marginBottom: 8 }}>
          <Glyph name="gavel" size={16} />
        </span>
        <div>Select a dispute to inspect.</div>
        <div className="mono" style={{ fontSize: 10.5, marginTop: 6 }}>j / k to navigate</div>
      </div>
    </div>
  );

  const isWon = d.stage === 'Won';
  const isClosed = d.stage === 'Closed';
  const isSilent = d.silentDays >= 7 && !['Won', 'Closed'].includes(d.stage);

  const Row = ({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px dashed var(--line-2)' }}>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{k}</span>
      <span className={mono ? 'mono tnum' : ''} style={{ fontSize: 11.5, fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  );

  const nextStageLabel = (() => {
    const idx = STAGES.indexOf(d.stage);
    if (idx === -1 || idx >= STAGES.length - 1) return null;
    return STAGES[idx + 1];
  })();

  const handleSubmitNote = () => {
    if (!noteInput.trim()) return;
    onAddNote(d, noteInput.trim());
    setNoteInput('');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <RuleTag rule={d.rule} />
          <StagePill stage={d.stage} />
          {isSilent && (
            <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber-ink)', background: 'var(--amber-soft)', border: '1px solid var(--amber-line)', padding: '1px 5px', borderRadius: 3 }}>
              {d.silentDays}D SILENT
            </span>
          )}
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', marginLeft: 'auto' }}>{d.displayId}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{d.client}</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{d.invoice} {d.pro && `· PRO ${d.pro}`}</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        <div style={{
          background: isWon ? 'var(--green-soft)' : 'var(--surface-sunk)',
          border: `1px solid ${isWon ? 'var(--green-line)' : 'var(--line)'}`,
          borderRadius: 9, padding: '11px 13px', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: isWon ? 'var(--green-ink)' : 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {isWon ? 'Recovered' : 'Claim amount'}
            </div>
            <div className="mono tnum" style={{ fontSize: 22, fontWeight: 700, color: isWon ? 'var(--green-ink)' : 'var(--ink)', marginTop: 2 }}>
              {fmtUSD(isWon ? d.recovery : d.amount, true)}
            </div>
          </div>
          {d.deadline && !isWon && !isClosed && <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>Carrier deadline</div>
            <DeadlineChip iso={d.deadline} />
          </div>}
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Shipment</div>
        <Row k="Carrier" v={<CarrierMark scac={d.carrier} withName />} />
        {d.invoice && <Row k="Invoice" v={d.invoice} mono />}
        {d.pro && <Row k="PRO" v={d.pro} mono />}
        <Row k="Owner" v={d.owner} />
        {d.opened && <Row k="Opened" v={fmtDateFull(d.opened)} mono />}
        {d.filed && <Row k="Filed" v={fmtDateFull(d.filed)} mono />}
        {d.resolved && <Row k={isWon ? 'Won' : 'Resolved'} v={fmtDateFull(d.resolved)} mono />}

        {d.notes && (
          <>
            <div style={{ height: 12 }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', padding: '9px 11px', background: 'var(--surface-sunk)', borderRadius: 7, border: '1px solid var(--line)' }}>
              {d.notes}
            </div>
          </>
        )}

        <div style={{ height: 16 }} />
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 9 }}>Audit trail</div>
        <AuditTrail events={d.events} />
      </div>

      {/* NEW: Quick Note Input */}
      {!['Won', 'Closed'].includes(d.stage) && (
        <div style={{ marginTop: 24 }}>
          <textarea 
            placeholder="Add an internal note or carrier response update..."
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            style={{
              width: '100%', height: 60, padding: '8px 10px', fontSize: 12, resize: 'none',
              background: 'var(--canvas)', border: '1px solid var(--line)', borderRadius: 6,
              fontFamily: 'inherit', color: 'var(--ink)'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <Btn size="sm" onClick={handleSubmitNote} disabled={!noteInput.trim()}>
              Save Note
            </Btn>
          </div>
        </div>
      )}

      {!['Won', 'Closed'].includes(d.stage) && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', display: 'flex', gap: 7 }}>
          {isSilent && (
            <Btn variant="amber" size="md" onClick={() => onMarkResponded(d)}>
              Mark carrier responded
            </Btn>
          )}
          <div style={{ flex: 1 }} />
          {nextStageLabel && (
            <Btn variant="primary" size="md" onClick={() => onAdvance(d)}>
              {nextStageLabel === 'Won' ? 'Mark won →' : `Advance to ${nextStageLabel} →`}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

// ── helper: build a trail event for a newly-advanced stage ──────
function eventForStage(stage: string, date: string): TrailEvent {
  switch (stage) {
    case 'In review': return { kind: 'reviewed',  date, actor: 'Team', note: 'Marked in review.' };
    case 'Submitted': return { kind: 'filed',     date, actor: 'Team', note: 'Filed with carrier.' };
    case 'Escalated': return { kind: 'escalated', date, actor: 'Team', note: 'Escalated for follow-up.' };
    case 'Won':       return { kind: 'won',       date, actor: 'Carrier', note: 'Marked won.' };
    case 'Closed':    return { kind: 'closed',    date, actor: 'Team', note: 'Closed.' };
    default:          return { kind: 'opened',    date, actor: 'Team', note: stage };
  }
}



