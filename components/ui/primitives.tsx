/*
  components/ui/primitives.tsx — small shared visual pieces.

  Extracted from your components.jsx. These are pure presentational
  components (no data fetching, no Airtable). Used across the queue,
  disputes, and dashboard screens.
*/

'use client';

import { useState, useEffect, useRef } from 'react';
import { fmtUSD, fmtDate, daysUntil, type Confidence } from '@/lib/format';

// ── Rule tag (3-letter dense badge) ─────────────────────────────
const RULE_META: Record<string, { short: string; name: string; hue: number }> = {
  DIM_WEIGHT_TRAP:     { short: 'DIM',  name: 'Dim-weight trap',     hue: 280 },
  PHANTOM_ACCESSORIAL: { short: 'ACC',  name: 'Phantom accessorial', hue: 50  },
  DUPLICATE_TRACKING:  { short: 'DUP',  name: 'Duplicate tracking',  hue: 152 },
  SLA_FAILURE:         { short: 'SLA',  name: 'SLA failure',         hue: 220 },
  LTL_SLA_FAILURE:     { short: 'LTL',  name: 'LTL SLA failure',     hue: 244 },
};

export function RuleTag({ rule }: { rule: string }) {
  const r = RULE_META[rule] || { short: rule.slice(0, 3).toUpperCase(), name: rule, hue: 70 };
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 5px',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      borderRadius: 3, whiteSpace: 'nowrap',
      color: `oklch(0.85 0.10 ${r.hue})`,
      background: `oklch(0.30 0.06 ${r.hue})`,
      border: `1px solid oklch(0.42 0.10 ${r.hue})`,
      lineHeight: 1.5,
    }}>{r.short}</span>
  );
}

export function ruleName(rule: string) {
  return (RULE_META[rule] || { name: rule }).name;
}

// ── Review status pill (New / Reviewing / Approved / Dismissed) ─
const STATUS_ABBR: Record<string, string> = {
  New: 'NEW', Reviewing: 'REV', Approved: 'APR', Dismissed: 'DSM',
};
const STATUS_STYLE: Record<string, { c: string; bg: string; b: string }> = {
  New:       { c: 'var(--amber-ink)', bg: 'var(--amber-soft)', b: 'var(--amber-line)' },
  Reviewing: { c: 'var(--blue-ink)',  bg: 'var(--blue-soft)',  b: 'var(--blue-line)' },
  Approved:  { c: 'var(--green-ink)', bg: 'var(--green-soft)', b: 'var(--green-line)' },
  Dismissed: { c: 'var(--ink-3)',     bg: 'var(--surface-2)',  b: 'var(--line)' },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.New;
  return (
    <span className="mono" style={{
      display: 'inline-flex', padding: '1px 6px', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.04em', borderRadius: 3, whiteSpace: 'nowrap',
      color: s.c, background: s.bg, border: `1px solid ${s.b}`, lineHeight: 1.5,
    }}>{STATUS_ABBR[status] || status}</span>
  );
}

// Inline-editable status — click to open dropdown, calls onChange(newStatus)
export function StatusEdit({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const labels: Record<string, string> = {
    New: 'New', Reviewing: 'Reviewing', Approved: 'To dispute', Dismissed: 'Dismissed',
  };

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
        <StatusPill status={status} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 30,
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8,
          boxShadow: 'var(--shadow-lg)', padding: 4, minWidth: 130,
        }} onClick={(e) => e.stopPropagation()}>
          {Object.keys(STATUS_ABBR).map(k => (
            <button key={k} onClick={() => { onChange(k); setOpen(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '5px 7px',
              border: 'none', borderRadius: 5,
              background: status === k ? 'var(--surface-sunk)' : 'transparent',
              color: 'var(--ink-2)', fontSize: 11.5, textAlign: 'left', cursor: 'pointer',
            }}>
              <StatusPill status={k} />
              <span style={{ flex: 1 }}>{labels[k]}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// ── Deadline chip — color-codes urgency ─────────────────────────
export function DeadlineChip({ iso }: { iso?: string | null }) {
  if (!iso) return <span style={{ color: 'var(--ink-faint)' }}>—</span>;
  const n = daysUntil(iso);
  if (n === null) return <span style={{ color: 'var(--ink-faint)' }}>—</span>;

  let tone: 'hot' | 'amber' | 'calm' | 'closed';
  let label: string;
  if (n < 0)        { tone = 'closed'; label = `${Math.abs(n)}d over`; }
  else if (n === 0) { tone = 'hot';    label = 'today'; }
  else if (n <= 2)  { tone = 'hot';    label = `${n}d`; }
  else if (n <= 5)  { tone = 'amber';  label = `${n}d`; }
  else              { tone = 'calm';   label = `${n}d`; }

  const map = {
    hot:    { c: 'var(--hot-ink)',   bg: 'var(--hot-soft)',    b: 'var(--hot-line)' },
    amber:  { c: 'var(--amber-ink)', bg: 'var(--amber-soft)',  b: 'var(--amber-line)' },
    calm:   { c: 'var(--ink-3)',     bg: 'var(--surface-sunk)', b: 'var(--line-strong)' },
    closed: { c: 'var(--ink-faint)', bg: 'var(--surface-2)',   b: 'var(--line)' },
  };
  const s = map[tone];

  return (
    <span className="mono tnum" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 5px',
      fontSize: 10.5, fontWeight: 700, borderRadius: 3, whiteSpace: 'nowrap',
      color: s.c, background: s.bg, border: `1px solid ${s.b}`, lineHeight: 1.5,
    }}>
      {tone === 'hot' && <span style={{
        width: 4, height: 4, borderRadius: 9, background: 'var(--hot)',
        animation: 'faBlink 1.1s steps(1) infinite',
      }} />}
      {label}
    </span>
  );
}

// ── Carrier mark — small monogram + name ────────────────────────
const CARRIER_HUE: Record<string, number> = {
  FDEG: 280, UPSN: 70, DHLE: 50, USPS: 244,
  OAKH: 152, PTLN: 200, RDWY: 30, KNGT: 10, STRC: 320,
  XPOF: 90, ODFL: 130, FXFE: 280, EXLA: 60, SAIA: 180,
};

export function CarrierMark({ scac, withName = false, dim = false }: {
  scac: string; withName?: boolean; dim?: boolean;
}) {
  const hue = CARRIER_HUE[scac] || 70;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="mono" style={{
        width: 16, height: 16, borderRadius: 3, display: 'grid', placeItems: 'center',
        fontSize: 8.5, fontWeight: 700, letterSpacing: '-0.02em', flexShrink: 0,
        color: `oklch(0.85 0.10 ${hue})`,
        background: `oklch(0.30 0.07 ${hue})`,
        border: `1px solid oklch(0.42 0.10 ${hue})`,
        opacity: dim ? 0.6 : 1,
      }}>{scac.slice(0, 2)}</span>
      {withName && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>{scac}</span>}
    </span>
  );
}

// ── Confidence mark — derived from variance % ───────────────────

const CONF_STYLE: Record<Confidence, { c: string; label: string; dot: string }> = {
  high:       { c: 'var(--green-ink)', label: 'HI',  dot: 'var(--green)' },
  medium:     { c: 'var(--amber-ink)', label: 'MED', dot: 'var(--amber)' },
  borderline: { c: 'var(--ink-3)',     label: 'BOR', dot: 'var(--ink-3)' },
};

export function ConfMark({ level }: { level: Confidence }) {
  const s = CONF_STYLE[level] || CONF_STYLE.medium;
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
      fontWeight: 700, color: s.c, lineHeight: 1.4,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 9, background: s.dot }} />
      {s.label}
    </span>
  );
}

// ── Stage pill (Disputes pipeline: Open/In review/.../Closed) ──
const STAGE_ABBR: Record<string, string> = {
  'Open': 'OPN', 'In review': 'REV', 'Submitted': 'SUB',
  'Escalated': 'ESC', 'Won': 'WON', 'Closed': 'CLS',
};
const STAGE_STYLE: Record<string, { c: string; bg: string; b: string }> = {
  'Open':      { c: 'var(--ink-2)',     bg: 'var(--surface-sunk)', b: 'var(--line-strong)' },
  'In review': { c: 'var(--blue-ink)',  bg: 'var(--blue-soft)',    b: 'var(--blue-line)' },
  'Submitted': { c: 'var(--violet-ink)',bg: 'var(--violet-soft)',  b: 'var(--violet-line)' },
  'Escalated': { c: 'var(--amber-ink)', bg: 'var(--amber-soft)',   b: 'var(--amber-line)' },
  'Won':       { c: 'var(--green-ink)', bg: 'var(--green-soft)',   b: 'var(--green-line)' },
  'Closed':    { c: 'var(--ink-3)',     bg: 'var(--surface-2)',    b: 'var(--line)' },
};

export function StagePill({ stage, full = false }: { stage: string; full?: boolean }) {
  const s = STAGE_STYLE[stage] || STAGE_STYLE['Open'];
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      borderRadius: 3, whiteSpace: 'nowrap',
      color: s.c, background: s.bg, border: `1px solid ${s.b}`,
      lineHeight: 1.5,
    }}>{full ? stage : (STAGE_ABBR[stage] || stage)}</span>
  );
}



// ── Audit trail timeline ────────────────────────────────────────
export type TrailEvent = { kind: string; date: string; actor: string; note: string };

const EVENT_META: Record<string, { color: string; dot: string; label: string }> = {
  opened:    { color: 'var(--ink-3)',     dot: 'var(--ink-3)',  label: 'Opened' },
  reviewed:  { color: 'var(--blue-ink)',  dot: 'var(--blue)',   label: 'Reviewed' },
  filed:     { color: 'var(--violet-ink)',dot: 'var(--violet)', label: 'Filed' },
  escalated: { color: 'var(--amber-ink)', dot: 'var(--amber)',  label: 'Escalated' },
  won:       { color: 'var(--green-ink)', dot: 'var(--green)',  label: 'Won' },
  closed:    { color: 'var(--ink-3)',     dot: 'var(--ink-3)',  label: 'Closed' },
};

export function AuditTrail({ events }: { events: TrailEvent[] }) {
  if (!events || !events.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {events.map((e, i) => {
        const m = EVENT_META[e.kind] || EVENT_META.opened;
        const last = i === events.length - 1;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: 10, paddingBottom: last ? 0 : 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: m.dot, marginTop: 4 }} />
              {!last && <span style={{ width: 1, flex: 1, background: 'var(--line)', minHeight: 12, marginTop: 3 }} />}
            </div>
            <div style={{ paddingTop: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: m.color }}>{m.label}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-faint)' }}>{fmtDate(e.date)} · {e.actor}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.45 }}>{e.note}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


export function Checkbox({ checked, indeterminate, onChange, ariaLabel }: {
  checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; ariaLabel?: string;
}) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      aria-label={ariaLabel}
      style={{
        width: 14, height: 14, borderRadius: 3, padding: 0, flexShrink: 0,
        border: `1px solid ${checked || indeterminate ? 'var(--amber)' : 'var(--line-strong)'}`,
        background: checked || indeterminate ? 'var(--amber)' : 'var(--surface)',
        display: 'inline-grid', placeItems: 'center', cursor: 'pointer',
      }}>
      {checked && (
        <svg viewBox="0 0 24 24" style={{ width: 11, height: 11, fill: 'none', stroke: 'var(--canvas)', strokeWidth: 3.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M5 12l5 5 9-10" />
        </svg>
      )}
      {indeterminate && !checked && <span style={{ width: 7, height: 2, background: 'var(--canvas)', borderRadius: 1 }} />}
    </button>
  );
}

// ── Button ───────────────────────────────────────────────────────
type BtnVariant = 'default' | 'ghost' | 'green' | 'amber' | 'primary';
type BtnSize = 'sm' | 'md';

export function Btn({
  children, variant = 'default', size = 'md', onClick, style, ...rest
}: {
  children: React.ReactNode; variant?: BtnVariant; size?: BtnSize;
  onClick?: (e: React.MouseEvent) => void; style?: React.CSSProperties;
  [key: string]: any;
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'center',
    fontWeight: 600, borderRadius: 6, cursor: 'pointer',
    border: '1px solid transparent', whiteSpace: 'nowrap',
    fontSize: size === 'sm' ? 11 : 12, padding: size === 'sm' ? '3px 8px' : '5px 12px',
  };
  const variants: Record<BtnVariant, React.CSSProperties> = {
    default: { background: 'var(--surface)', border: '1px solid var(--line-strong)', color: 'var(--ink)' },
    ghost:   { background: 'transparent', border: '1px solid transparent', color: 'var(--ink-2)' },
    green:   { background: 'var(--green)', border: '1px solid var(--green)', color: 'var(--canvas)' },
    amber:   { background: 'var(--amber)', border: '1px solid var(--amber)', color: 'var(--canvas)' },
    primary: { background: 'var(--ink)', border: '1px solid var(--ink)', color: 'var(--canvas)' },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}

// ── Glyph (icon set) ──────────────────────────────────────────────
export function Glyph({ name, size = 14 }: { name: string; size?: number }) {
  const s = {
    width: size, height: size, fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  const paths: Record<string, React.ReactNode> = {
    flag:  <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
    gavel: <><path d="M14 13l-7 7M11 6l6 6M9 4l6 6-3 3-6-6zM17 14l3 3" /></>,
    grid:  <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    check: <path d="M5 12l5 5 9-10" />,
    x:     <path d="M6 6l12 12M18 6L6 18" />,
    chevronDown: <path d="M6 9l6 6 6-6" />,
  };
  return <svg viewBox="0 0 24 24" style={s}>{paths[name]}</svg>;
}

// ── Segmented control ────────────────────────────────────────────
export function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div style={{
      display: 'inline-flex', padding: 2, gap: 2, borderRadius: 7,
      background: 'var(--surface-sunk)', border: '1px solid var(--line)',
    }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: '2px 8px', fontSize: 11, fontWeight: 600, borderRadius: 5, border: 'none',
          cursor: 'pointer',
          background: value === o.value ? 'var(--surface)' : 'transparent',
          color: value === o.value ? 'var(--ink)' : 'var(--ink-3)',
          boxShadow: value === o.value ? 'var(--shadow-sm)' : 'none',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// ── Filter chip (with × to remove) ───────────────────────────────
export function FilterChip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 6px 2px 9px',
      borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: 'var(--amber-soft)', color: 'var(--amber-ink)',
      border: '1px solid var(--amber-line)',
    }}>
      {children}
      <button onClick={onRemove} style={{
        border: 'none', background: 'transparent', padding: 0, color: 'inherit',
        display: 'grid', placeItems: 'center', cursor: 'pointer',
      }}>
        <Glyph name="x" size={10} />
      </button>
    </span>
  );
}

// ── Filter popover (multi-select dropdown) ───────────────────────
export function FilterPopover({ label, options, selected, onToggle }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const active = selected.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
        fontSize: 11.5, fontWeight: 600, borderRadius: 14, whiteSpace: 'nowrap',
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--amber)' : 'var(--line-strong)'}`,
        background: active ? 'var(--amber-soft)' : 'transparent',
        color: active ? 'var(--amber-ink)' : 'var(--ink-2)',
      }}>
        {label}
        {active && (
          <span className="mono tnum" style={{
            fontSize: 10, padding: '0 4px', background: 'var(--amber)',
            color: 'var(--canvas)', borderRadius: 7,
          }}>{selected.length}</span>
        )}
        <Glyph name="chevronDown" size={9} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 30, minWidth: 150,
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 7,
          boxShadow: 'var(--shadow-lg)', padding: 4,
        }}>
          {options.map(o => (
            <button key={o.value} onClick={() => onToggle(o.value)} style={{
              display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '4px 7px',
              border: 'none', borderRadius: 5, background: 'transparent', textAlign: 'left',
              fontSize: 11.5, cursor: 'pointer', color: 'var(--ink-2)',
            }}>
              <Checkbox checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
              <span style={{ flex: 1 }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
