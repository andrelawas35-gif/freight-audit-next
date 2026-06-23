/*
  components/portal/status-tag.tsx — friendly, color-coded dispute status pills.

  Maps the raw pipeline status to plain-language labels a non-technical
  client can read at a glance, so they always know where a claim stands.
*/

export const STATUS_MAP: Record<string, { label: string; fg: string; bg: string; bd: string }> = {
  Open:         { label: 'New',              fg: 'var(--blue-ink)',  bg: 'var(--blue-soft)',  bd: 'var(--blue-line)' },
  'In review':  { label: 'In Review',        fg: 'var(--blue-ink)',  bg: 'var(--blue-soft)',  bd: 'var(--blue-line)' },
  Submitted:    { label: 'Filed',            fg: 'var(--amber-ink)', bg: 'var(--amber-soft)', bd: 'var(--amber-line)' },
  Escalated:    { label: 'Carrier Pushback', fg: 'oklch(0.82 0.13 30)', bg: 'oklch(0.30 0.07 30)', bd: 'oklch(0.46 0.11 30)' },
  Won:          { label: 'Pending Credit',   fg: 'var(--green-ink)', bg: 'var(--green-soft)', bd: 'var(--green-line)' },
  Closed:       { label: 'Credited',         fg: 'var(--ink-2)',     bg: 'var(--surface-sunk)', bd: 'var(--line)' },
};

export function StatusTag({ status }: { status?: string }) {
  const s = STATUS_MAP[status || 'Open'] || STATUS_MAP.Open;
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
