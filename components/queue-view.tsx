/*
  components/queue-view.tsx — Audit Queue, two-pane interactive UI.

  Converted from screen_queue.jsx. Behavior preserved:
    - j/k or arrow keys to navigate the list
    - x to multi-select, f to file dispute, d to dismiss
    - Filter chips (carrier, rule, status, confidence, has-deadline)
    - Group by none/carrier/rule/client/confidence
    - Sort by date/confidence/deadline/recoverable amount
    - Inline status editing
    - Bulk action bar when rows are selected
    - Filing template modal

  Data comes in as `initialRows` from the server component (app/queue/page.tsx).
  Writes go through server actions in app/queue/actions.ts — each action
  calls revalidatePath, so after a write Next.js refetches and this
  component receives updated `initialRows` automatically.
*/

'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { fmtUSD, fmtDate, fmtDateFull, daysUntil } from '@/lib/format';
import {
  RuleTag, ruleName, StatusEdit, DeadlineChip, CarrierMark, ConfMark,
  Checkbox, Btn, Glyph, Segmented, FilterChip, FilterPopover, Card, KPI, Bars, SectionLabel, StatBar,
  type Confidence,
} from '@/components/ui/primitives';
import { templateFor } from '@/lib/templates';
import {
  setReviewStatus, dismissFinding, fileDispute,
  fileDisputesBulk, dismissBulk, approveBulk,
} from '@/app/queue/actions';

export type QueueRow = {
  id: string;
  client: string;
  invoice: string;
  carrier: string;
  rule: string;
  pro: string;
  svc: string;
  billed: number;
  expected: number;
  recover: number;
  variance: number;
  confidence: Confidence;
  status: 'new' | 'reviewing' | 'approved' | 'dismissed';
  deadline: string | null;
  detected: string;
  note: string;
  daysLate?: number;
};

const GROUP_LABELS: Record<string, string> = {
  none: 'None', carrier: 'Carrier', rule: 'Rule', client: 'Client', confidence: 'Confidence',
};
const CONF_ORDER: Record<Confidence, number> = { high: 0, medium: 1, borderline: 2 };

export function QueueView({ initialRows, loadError }: { initialRows: QueueRow[]; loadError: string | null }) {
  const [rows, setRows] = useState(initialRows);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [rules, setRules] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>(['new', 'reviewing', 'approved']);
  const [confs, setConfs] = useState<Confidence[]>([]);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [groupBy, setGroupBy] = useState('none');
  const [sort, setSort] = useState('recover');
  const [sel, setSel] = useState<QueueRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tmplRow, setTmplRow] = useState<QueueRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  // keep local rows in sync if server re-fetches (revalidatePath)
  useEffect(() => { setRows(initialRows); }, [initialRows]);

  // ── filtering ──────────────────────────────────────────────
  let filtered = rows.filter(r => {
    if (carriers.length && !carriers.includes(r.carrier)) return false;
    if (rules.length && !rules.includes(r.rule)) return false;
    if (statuses.length && !statuses.includes(r.status)) return false;
    if (confs.length && !confs.includes(r.confidence)) return false;
    if (hasDeadline && !r.deadline) return false;
    return true;
  });

  // ── sorting ────────────────────────────────────────────────
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'recover') return b.recover - a.recover;
    if (sort === 'deadline') {
      const da = a.deadline ? (daysUntil(a.deadline) ?? 999) : 999;
      const db = b.deadline ? (daysUntil(b.deadline) ?? 999) : 999;
      return da - db;
    }
    if (sort === 'detected') return new Date(b.detected).getTime() - new Date(a.detected).getTime();
    if (sort === 'confidence') return (CONF_ORDER[a.confidence] ?? 9) - (CONF_ORDER[b.confidence] ?? 9);
    return 0;
  });

  // ── grouping ───────────────────────────────────────────────
  type Group = { key: string; label: string | null; items: QueueRow[] };
  let grouped: Group[] = [];
  if (groupBy === 'none') {
    grouped = [{ key: '_all', label: null, items: filtered }];
  } else {
    const keyer: Record<string, (r: QueueRow) => string> = {
      carrier:    (r) => r.carrier,
      rule:       (r) => r.rule,
      client:     (r) => r.client,
      confidence: (r) => r.confidence,
    };
    const labeler: Record<string, (k: string) => string> = {
      carrier:    (k) => k,
      rule:       (k) => ruleName(k),
      client:     (k) => k,
      confidence: (k) => ({ high: 'High confidence (>20% variance)', medium: 'Medium (10–20%)', borderline: 'Borderline (≤10%)' }[k] || k),
    };
    const buckets: Record<string, QueueRow[]> = {};
    filtered.forEach(r => {
      const k = keyer[groupBy](r);
      (buckets[k] = buckets[k] || []).push(r);
    });
    grouped = Object.keys(buckets).map(k => ({ key: k, label: labeler[groupBy](k), items: buckets[k] }));
  }

  const flat = grouped.flatMap(g => g.items);

  // select first row by default
  useEffect(() => {
    if (!sel && flat.length) setSel(flat[0]);
  }, [flat, sel]);

  // ── write actions (optimistic UI + server action) ───────────
  const handleStatusChange = (row: QueueRow, status: QueueRow['status']) => {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, status } : r));
    const airtableStatus = { new: 'New', reviewing: 'Reviewing', approved: 'Approved', dismissed: 'Dismissed' }[status];
    startTransition(() => { setReviewStatus(row.id, airtableStatus); });
  };

  const handleDismiss = (row: QueueRow) => {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'dismissed' } : r));
    startTransition(() => { dismissFinding(row.id); });
  };

  const handleFile = (row: QueueRow) => {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'approved' } : r));
    startTransition(() => { fileDispute(row.id); });
  };

  // ── keyboard nav ───────────────────────────────────────────
  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.metaKey || e.ctrlKey) return;
      const i = flat.findIndex(r => r.id === sel?.id);
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); if (i < flat.length - 1) setSel(flat[i + 1]); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) setSel(flat[i - 1]); }
      else if (e.key === 'x') { e.preventDefault(); if (sel) toggleOne(sel.id); }
      else if (e.key === 'f') { e.preventDefault(); if (sel && sel.status !== 'dismissed') handleFile(sel); }
      else if (e.key === 'd') { e.preventDefault(); if (sel && sel.status !== 'dismissed') handleDismiss(sel); }
      else if (e.key === 'Escape') setSelectedIds(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, sel]);

  useEffect(() => {
    if (!sel || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-rid="${sel.id}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const allChecked = flat.length > 0 && flat.every(r => selectedIds.has(r.id));
  const someChecked = !allChecked && flat.some(r => selectedIds.has(r.id));
  const toggleAll = () => {
    setSelectedIds(prev => {
      if (allChecked) return new Set();
      const n = new Set(prev);
      flat.forEach(r => n.add(r.id));
      return n;
    });
  };
  const selRows = flat.filter(r => selectedIds.has(r.id));
  const selTotal = selRows.reduce((a, b) => a + b.recover, 0);

  // ── bulk handlers ───────────────────────────────────────────
  const bulkFile = () => {
    const ids = selRows.filter(r => r.status !== 'dismissed').map(r => r.id);
    setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: 'approved' } : r));
    setSelectedIds(new Set());
    startTransition(() => { fileDisputesBulk(ids); });
  };
  const bulkApprove = () => {
    const ids = selRows.map(r => r.id);
    setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: 'reviewing' } : r));
    startTransition(() => { approveBulk(ids); });
  };
  const bulkDismiss = () => {
    const ids = selRows.map(r => r.id);
    setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: 'dismissed' } : r));
    setSelectedIds(new Set());
    startTransition(() => { dismissBulk(ids); });
  };

  // ── filter helpers ───────────────────────────────────────────
  const toggleArr = <T extends string>(setter: React.Dispatch<React.SetStateAction<T[]>>) => (v: T) =>
    setter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const clearAll = () => { setCarriers([]); setRules([]); setStatuses(['new', 'reviewing', 'approved']); setConfs([]); setHasDeadline(false); };

  const carrierOptions  = [...new Set(rows.map(r => r.carrier))].map(c => ({ value: c, label: c }));
  const ruleOptions     = [...new Set(rows.map(r => r.rule))].map(r => ({ value: r, label: ruleName(r).slice(0, 12) }));

  const activeChips = [
    ...carriers.map(c => ({ id: 'c-' + c, label: `Carrier: ${c}`, onRemove: () => setCarriers(carriers.filter(x => x !== c)) })),
    ...rules.map(r => ({ id: 'r-' + r, label: `Rule: ${ruleName(r)}`, onRemove: () => setRules(rules.filter(x => x !== r)) })),
    ...(hasDeadline ? [{ id: 'dl', label: 'Has deadline', onRemove: () => setHasDeadline(false) }] : []),
    ...confs.map(c => ({ id: 'cf-' + c, label: `Conf: ${({ high: 'HI', medium: 'MED', borderline: 'BOR' } as Record<string,string>)[c]}`, onRemove: () => setConfs(confs.filter(x => x !== c)) })),
  ];

  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Couldn't load the queue</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--hot-ink)' }}>{loadError}</div>
        <div style={{ fontSize: 12, marginTop: 12 }}>Check your AIRTABLE_PAT and AIRTABLE_BASE_ID in .env.local</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Queue is clear</div>
        <div style={{ fontSize: 12.5 }}>No flagged audit results found. Run your audit scripts to populate this view.</div>
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
        <FilterPopover label="Carrier" options={carrierOptions} selected={carriers} onToggle={toggleArr(setCarriers)} />
        <FilterPopover label="Rule" options={ruleOptions} selected={rules} onToggle={toggleArr(setRules)} />
        <FilterPopover label="Status" options={[{ value: 'new', label: 'NEW' }, { value: 'reviewing', label: 'REV' }, { value: 'approved', label: 'APR' }, { value: 'dismissed', label: 'DSM' }]} selected={statuses} onToggle={toggleArr(setStatuses)} />
        <FilterPopover label="Confidence" options={[{ value: 'high', label: 'HI' }, { value: 'medium', label: 'MED' }, { value: 'borderline', label: 'BOR' }]} selected={confs} onToggle={toggleArr(setConfs as any)} />
        <button onClick={() => setHasDeadline(d => !d)} style={{
          padding: '3px 9px', fontSize: 11.5, fontWeight: 600, borderRadius: 14, cursor: 'pointer',
          border: `1px solid ${hasDeadline ? 'var(--amber)' : 'var(--line-strong)'}`,
          background: hasDeadline ? 'var(--amber-soft)' : 'transparent',
          color: hasDeadline ? 'var(--amber-ink)' : 'var(--ink-2)',
        }}>Has deadline</button>
        <span style={{ width: 1, height: 18, background: 'var(--line)', marginInline: 3 }} />
        <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Group</span>
        <Segmented value={groupBy} onChange={setGroupBy} options={Object.entries(GROUP_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
        <div style={{ flex: 1 }} />
        {activeChips.length > 0 && (
          <button onClick={clearAll} style={{ fontSize: 11, color: 'var(--ink-3)', background: 'transparent', border: 'none', textDecoration: 'underline', textDecorationStyle: 'dotted', cursor: 'pointer' }}>Clear filters</button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', borderRadius: 5, background: 'var(--green-soft)', border: '1px solid var(--green-line)' }}>
          <span style={{ fontSize: 10, color: 'var(--green-ink)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Exposure</span>
          <span className="mono tnum" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-ink)' }}>
            {fmtUSD(filtered.filter(r => r.status !== 'dismissed').reduce((a, b) => a + b.recover, 0))}
          </span>
        </div>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--line)', background: 'var(--canvas)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 3 }}>Active</span>
          {activeChips.map(c => <FilterChip key={c.id} onRemove={c.onRemove}>{c.label}</FilterChip>)}
        </div>
      )}

      {/* Two-pane layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', minHeight: 0 }}>

        {/* LEFT: list */}
        <div ref={listRef} style={{ overflow: 'auto', borderRight: '1px solid var(--line)' }}>
          <div style={{
            position: 'sticky', top: 0, zIndex: 6, background: 'var(--surface-2)', borderBottom: '1px solid var(--line)',
            display: 'grid', gridTemplateColumns: '28px 46px 1fr 64px 110px 80px 76px 80px', gap: 8,
            padding: '6px 10px', alignItems: 'center', fontSize: 10, color: 'var(--ink-faint)',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
          }}>
            <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} ariaLabel="select all" />
            <button onClick={() => setSort('detected')} style={sortBtnStyle(sort === 'detected')}>Date {sort === 'detected' ? '↓' : ''}</button>
            <span>Client / Invoice</span>
            <span>Rule</span>
            <span>Carrier</span>
            <button onClick={() => setSort('confidence')} style={sortBtnStyle(sort === 'confidence')}>Conf {sort === 'confidence' ? '↓' : ''}</button>
            <button onClick={() => setSort('deadline')} style={sortBtnStyle(sort === 'deadline')}>Deadline {sort === 'deadline' ? '↓' : ''}</button>
            <button onClick={() => setSort('recover')} style={{ ...sortBtnStyle(sort === 'recover'), textAlign: 'right' }}>$ Recover {sort === 'recover' ? '↓' : ''}</button>
          </div>

          {grouped.map(g => (
            <div key={g.key}>
              {g.label && (
                <div style={{
                  position: 'sticky', top: 26, zIndex: 5, background: 'var(--canvas)', padding: '5px 12px',
                  borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 9,
                }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g.label}</span>
                  <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{g.items.length} · {fmtUSD(g.items.reduce((a, b) => a + b.recover, 0))}</span>
                </div>
              )}
              {g.items.map(r => (
                <QueueRowItem key={r.id} r={r} active={sel?.id === r.id} checked={selectedIds.has(r.id)}
                  onSelect={() => toggleOne(r.id)} onClick={() => setSel(r)}
                  onStatusChange={(s) => handleStatusChange(r, s as QueueRow['status'])} />
              ))}
            </div>
          ))}

          {flat.length === 0 && <div style={{ padding: 38, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>No findings match these filters.</div>}
        </div>

        {/* RIGHT: detail */}
        <div style={{ overflow: 'hidden' }}>
          <QueueDetail r={sel} onAct={handleFile} onDismiss={handleDismiss}
            onStatusChange={(row, s) => handleStatusChange(row, s as QueueRow['status'])} onTemplate={setTmplRow} />
        </div>
      </div>

      <BulkBar
        count={selRows.length} totalAmt={selTotal}
        onClear={() => setSelectedIds(new Set())}
        onFile={bulkFile} onApprove={bulkApprove} onDismiss={bulkDismiss}
      />

      <FilingTemplateModal row={tmplRow} onClose={() => setTmplRow(null)} onConfirm={handleFile} />

      {isPending && (
        <div style={{
          position: 'absolute', top: 8, right: 8, fontSize: 10, color: 'var(--ink-faint)',
          padding: '2px 8px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10,
        }}>Saving…</div>
      )}
    </div>
  );
}

// ── Filing template modal ──────────────────────────────────────
function FilingTemplateModal({ row, onClose, onConfirm }: {
  row: QueueRow | null; onClose: () => void; onConfirm: (row: QueueRow) => void;
}) {
  if (!row) return null;
  const tpl = templateFor(row.rule);
  const body = tpl.body
    .replaceAll('{pro}', row.pro || '—')
    .replaceAll('{invoice}', row.invoice || '—')
    .replaceAll('{recover}', fmtUSD(row.recover, true))
    .replaceAll('{svc}', row.svc || '—')
    .replaceAll('{days_late}', String(row.daysLate ?? 1));

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'oklch(0 0 0 / 0.55)', zIndex: 60, display: 'grid', placeItems: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 580, maxHeight: '80%', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 11, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{tpl.name}</span>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{row.carrier} · {ruleName(row.rule)}</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ border: 'none', background: 'var(--surface-sunk)', borderRadius: 5, width: 22, height: 22, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Glyph name="x" size={12} />
          </button>
        </div>
        <div style={{ padding: '14px 16px', overflow: 'auto', flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
            Filing body — pre-populated from rule template
          </div>
          <textarea defaultValue={body} style={{
            width: '100%', height: 220, padding: 10, fontSize: 12, lineHeight: 1.55,
            background: 'var(--surface-sunk)', border: '1px solid var(--line)', borderRadius: 7,
            color: 'var(--ink)', resize: 'none', fontFamily: 'var(--font)',
          }} />
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 10, background: 'var(--surface-sunk)', borderRadius: 7, border: '1px solid var(--line)' }}>
            <div>
              <span style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recovery</span>
              <div className="mono tnum" style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-ink)' }}>{fmtUSD(row.recover, true)}</div>
            </div>
            <div>
              <span style={{ fontSize: 10, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Filing deadline</span>
              <div className="mono" style={{ fontSize: 12, marginTop: 2 }}>{row.deadline ? fmtDateFull(row.deadline) : '—'}</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="green" onClick={() => { onConfirm(row); onClose(); }}>
            <Glyph name="check" size={12} />
            File with carrier
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Right pane: detail ──────────────────────────────────────────
function QueueDetail({ r, onAct, onDismiss, onStatusChange, onTemplate }: {
  r: QueueRow | null;
  onAct: (r: QueueRow) => void;
  onDismiss: (r: QueueRow) => void;
  onStatusChange: (r: QueueRow, s: string) => void;
  onTemplate: (r: QueueRow) => void;
}) {
  if (!r) return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', fontSize: 12 }}>
      <div style={{ textAlign: 'center' }}>
        <span style={{ display: 'inline-grid', placeItems: 'center', width: 36, height: 36, borderRadius: 9, background: 'var(--surface-sunk)', marginBottom: 8 }}>
          <Glyph name="flag" size={16} />
        </span>
        <div>Select a finding to inspect.</div>
        <div className="mono" style={{ fontSize: 10.5, marginTop: 6 }}>j / k to navigate · f to file · e to edit</div>
      </div>
    </div>
  );

  const Row = ({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px dashed var(--line-2)' }}>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{k}</span>
      <span className={mono ? 'mono tnum' : ''} style={{ fontSize: 11.5, fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <RuleTag rule={r.rule} />
          <StatusEdit status={mapToAirtableStatus(r.status)} onChange={(s) => onStatusChange(r, mapFromAirtableStatus(s))} />
          <ConfMark level={r.confidence} />
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', marginLeft: 'auto' }}>{r.id.slice(0, 10)}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.005em' }}>{r.client}</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{ruleName(r.rule)}</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        <div style={{
          background: 'var(--green-soft)', border: '1px solid var(--green-line)', borderRadius: 9,
          padding: '11px 13px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-ink)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recoverable</div>
            <div className="mono tnum" style={{ fontSize: 22, fontWeight: 700, color: 'var(--green-ink)', marginTop: 2 }}>{fmtUSD(r.recover, true)}</div>
          </div>
          {r.deadline && <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>Filing deadline</div>
            <DeadlineChip iso={r.deadline} />
          </div>}
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink-2)', marginBottom: 14, padding: '9px 11px', background: 'var(--surface-sunk)', borderRadius: 7, border: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Why flagged · </span>{r.note || 'No notes.'}
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Shipment</div>
        <Row k="Carrier" v={<CarrierMark scac={r.carrier} withName />} />
        <Row k="Invoice" v={r.invoice ? r.invoice.slice(0, 12) : '—'} mono />
        <Row k="PRO / tracking" v={r.pro || '—'} mono />
        <Row k="Service" v={r.svc || '—'} mono />
        <Row k="Detected" v={fmtDate(r.detected)} />
        <div style={{ height: 12 }} />
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Billing variance</div>
        <Row k="Billed" v={fmtUSD(r.billed, true)} mono />
        <Row k="Expected" v={fmtUSD(r.expected, true)} mono />
        <Row k="Variance" v={r.expected > 0 ? `+${(r.variance * 100).toFixed(1)}%` : '100% recoverable'} mono />
        <Row k="Confidence" v={<ConfMark level={r.confidence} />} />
      </div>

      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', display: 'flex', gap: 7 }}>
        {r.status !== 'dismissed' && (
          <Btn variant="ghost" size="md" onClick={() => onDismiss(r)} style={{ color: 'var(--ink-3)' }}>
            Dismiss <span className="kbd" style={{ marginLeft: 4 }}>d</span>
          </Btn>
        )}
        <div style={{ flex: 1 }} />
        <Btn variant="default" size="md" onClick={() => onTemplate(r)}>
          <Glyph name="grid" size={11} />
          Template
        </Btn>
        <Btn variant="green" size="md" onClick={() => onAct(r)}>
          File dispute <span className="kbd" style={{ marginLeft: 4, background: 'oklch(0 0 0 / 0.15)', color: 'inherit', borderColor: 'oklch(0 0 0 / 0.25)' }}>f</span>
        </Btn>
      </div>
    </div>
  );
}

// ── Bulk action bar ───────────────────────────────────────────
function BulkBar({ count, totalAmt, onClear, onFile, onApprove, onDismiss }: {
  count: number; totalAmt: number; onClear: () => void; onFile: () => void; onApprove: () => void; onDismiss: () => void;
}) {
  if (count === 0) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 30,
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px 7px 14px',
      background: 'var(--ink)', border: '1px solid oklch(0.4 0.02 70)', borderRadius: 9,
      boxShadow: 'var(--shadow-lg)',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--canvas)' }}>{count} selected</span>
      <span className="mono tnum" style={{ fontSize: 12, color: 'oklch(0.78 0.14 152)', fontWeight: 700 }}>{fmtUSD(totalAmt, true)}</span>
      <span style={{ width: 1, height: 18, background: 'oklch(0.4 0.02 70)', marginInline: 4 }} />
      <Btn variant="green" size="sm" onClick={onFile}>File disputes</Btn>
      <Btn variant="default" size="sm" onClick={onApprove} style={{ background: 'oklch(0.3 0.01 70)', color: 'var(--canvas)', borderColor: 'oklch(0.4 0.02 70)' }}>Mark reviewing</Btn>
      <Btn variant="ghost" size="sm" onClick={onDismiss} style={{ color: 'oklch(0.78 0.01 70)' }}>Dismiss</Btn>
      <button onClick={onClear} style={{
        border: 'none', background: 'transparent', padding: 3, color: 'oklch(0.78 0.01 70)',
        borderRadius: 5, display: 'grid', placeItems: 'center', cursor: 'pointer',
      }}>
        <Glyph name="x" size={13} />
      </button>
    </div>
  );
}

// ── Single row ────────────────────────────────────────────────
function QueueRowItem({ r, active, checked, onSelect, onClick, onStatusChange }: {
  r: QueueRow; active: boolean; checked: boolean;
  onSelect: () => void; onClick: () => void; onStatusChange: (s: string) => void;
}) {
  const dismissed = r.status === 'dismissed';
  return (
    <div data-rid={r.id} onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '28px 46px 1fr 64px 110px 80px 76px 80px', gap: 8, alignItems: 'center',
      padding: '0 10px', height: 30, cursor: 'pointer',
      borderBottom: '1px solid var(--line-2)',
      background: active ? 'var(--row-active)' : (checked ? 'var(--amber-soft)' : 'transparent'),
      opacity: dismissed ? 0.5 : 1,
    }}>
      <Checkbox checked={checked} onChange={onSelect} ariaLabel={`select ${r.id}`} />
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{fmtDate(r.detected)}</span>
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.client}</span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.invoice.slice(0, 8)}</span>
      </div>
      <RuleTag rule={r.rule} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CarrierMark scac={r.carrier} withName />
      </div>
      <ConfMark level={r.confidence} />
      <div>
        {r.deadline
          ? <DeadlineChip iso={r.deadline} />
          : <StatusEdit status={mapToAirtableStatus(r.status)} onChange={(s) => onStatusChange(mapFromAirtableStatus(s))} />}
      </div>
      <span className="mono tnum" style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: dismissed ? 'var(--ink-3)' : 'var(--green-ink)' }}>{fmtUSD(r.recover, true)}</span>
    </div>
  );
}

function sortBtnStyle(active: boolean): React.CSSProperties {
  return {
    background: 'transparent', border: 'none', color: active ? 'var(--ink-2)' : 'var(--ink-faint)',
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
    cursor: 'pointer', padding: 0, textAlign: 'left',
  };
}

// status mapping between the local lowercase status and Airtable's title-case
function mapToAirtableStatus(s: QueueRow['status']) {
  return { new: 'New', reviewing: 'Reviewing', approved: 'Approved', dismissed: 'Dismissed' }[s];
}
function mapFromAirtableStatus(s: string): QueueRow['status'] {
  return ({ New: 'new', Reviewing: 'reviewing', Approved: 'approved', Dismissed: 'dismissed' } as Record<string, QueueRow['status']>)[s] || 'new';
}
