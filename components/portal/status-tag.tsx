/*
  components/portal/status-tag.tsx — friendly, color-coded dispute status pills.

  Maps canonical dispute statuses (ADR 0005, lib/disputes/state-machine.ts) to
  plain-language labels a non-technical client can read at a glance.
  Legacy Airtable-era statuses are kept as fallback mappings.
*/

export const STATUS_MAP: Record<string, { label: string; fg: string; bg: string; bd: string }> = {
  // ── Canonical dispute statuses (ADR 0005) ──────────────────────
  pending_review:      { label: 'Pending Review',      fg: 'var(--blue-ink)',  bg: 'var(--blue-soft)',  bd: 'var(--blue-line)' },
  filed:               { label: 'Filed',               fg: 'var(--amber-ink)', bg: 'var(--amber-soft)', bd: 'var(--amber-line)' },
  carrier_responded:   { label: 'Carrier Responded',   fg: 'oklch(0.82 0.13 30)', bg: 'oklch(0.30 0.07 30)', bd: 'oklch(0.46 0.11 30)' },
  won:                 { label: 'Won',                 fg: 'var(--green-ink)', bg: 'var(--green-soft)', bd: 'var(--green-line)' },
  dismissed:           { label: 'Dismissed',           fg: 'var(--ink-2)',     bg: 'var(--surface-sunk)', bd: 'var(--line)' },
  partial:             { label: 'Partial',             fg: 'var(--amber-ink)', bg: 'var(--amber-soft)', bd: 'var(--amber-line)' },
  appealed:            { label: 'Appealed',            fg: 'oklch(0.82 0.13 30)', bg: 'oklch(0.30 0.07 30)', bd: 'oklch(0.46 0.11 30)' },
  closed:              { label: 'Closed',              fg: 'var(--ink-2)',     bg: 'var(--surface-sunk)', bd: 'var(--line)' },

  // ── Legacy Airtable-era statuses (backward compat) ─────────────
  Open:                { label: 'Pending Review',      fg: 'var(--blue-ink)',  bg: 'var(--blue-soft)',  bd: 'var(--blue-line)' },
  'In review':         { label: 'Pending Review',      fg: 'var(--blue-ink)',  bg: 'var(--blue-soft)',  bd: 'var(--blue-line)' },
  Submitted:           { label: 'Filed',               fg: 'var(--amber-ink)', bg: 'var(--amber-soft)', bd: 'var(--amber-line)' },
  Escalated:           { label: 'Carrier Responded',   fg: 'oklch(0.82 0.13 30)', bg: 'oklch(0.30 0.07 30)', bd: 'oklch(0.46 0.11 30)' },
  Won:                 { label: 'Won',                 fg: 'var(--green-ink)', bg: 'var(--green-soft)', bd: 'var(--green-line)' },
  Closed:              { label: 'Closed',              fg: 'var(--ink-2)',     bg: 'var(--surface-sunk)', bd: 'var(--line)' },
};

export function StatusTag({ status }: { status?: string }) {
  const s = STATUS_MAP[status ?? 'pending_review'] || STATUS_MAP.pending_review;
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10.5,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        color: s.fg,
        background: s.bg,
        border: `1px solid ${s.bd}`,
        whiteSpace: 'nowrap',
      }}
    >
      {s.label}
    </span>
  );
}
